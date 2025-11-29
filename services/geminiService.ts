
import { GoogleGenAI, Type } from "@google/genai";
import { Clue } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { PREDEFINED_CLUES } from '../data/clues';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper to shuffle array
const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const generateClues = async (
  category: string, 
  count: number, 
  difficulty: 'Easy' | 'Medium' | 'Hard',
  avoidList: string[] = []
): Promise<Clue[]> => {
  
  const avoidSet = new Set(avoidList.map(t => t.toLowerCase()));

  // 1. Try to fetch from local predefined list first for speed and reliability
  let localPool: string[] = [];
  
  if (category === 'Random') {
    Object.values(PREDEFINED_CLUES).forEach(list => {
      localPool = [...localPool, ...list];
    });
  } else if (PREDEFINED_CLUES[category]) {
    localPool = PREDEFINED_CLUES[category];
  }

  // Filter out clues that are already in the game
  localPool = localPool.filter(text => !avoidSet.has(text.toLowerCase()));

  // Shuffle local pool
  localPool = shuffle(localPool);
  
  const cluesToReturn: Clue[] = [];
  const takenTexts = new Set<string>(avoidList); // Initialize with avoided items to prevent internal dupe

  // Take up to 'count' from local
  const localCount = Math.min(count, localPool.length);
  for (let i = 0; i < localCount; i++) {
    cluesToReturn.push({
      id: uuidv4(),
      text: localPool[i],
      status: 'pending'
    });
    takenTexts.add(localPool[i]);
  }

  // If we satisfied the count locally, return immediately
  if (cluesToReturn.length >= count) {
    return cluesToReturn.slice(0, count);
  }

  // 2. If we need more, fetch from AI
  const needed = count - cluesToReturn.length;
  console.log(`Fetching ${needed} more clues from AI for category: ${category}`);

  try {
    const ai = getClient();
    
    let prompt = "";
    const avoidNote = avoidList.length > 0 ? "Ensure the clues are NOT in this list: " + avoidList.slice(0, 10).join(", ") + "..." : "";

    if (category === 'Random') {
       prompt = `Generate ${needed} distinct, fun, and varied charades words or phrases from a mix of categories (Movies, Actions, Objects, Persons, etc) with ${difficulty} difficulty. ${avoidNote}. Do not duplicate common ones.`;
    } else {
       prompt = `Generate ${needed} distinct and fun charades words or phrases for the category "${category}" with ${difficulty} difficulty. ${avoidNote}. Ensure they are suitable for a party game.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clues: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of charades clues"
            }
          },
          required: ["clues"]
        },
        systemInstruction: "You are a fun party game moderator helping generate content for Charades.",
      }
    });

    const jsonText = response.text;
    if (jsonText) {
      const parsed = JSON.parse(jsonText);
      const strings: string[] = parsed.clues || [];
      
      strings.forEach(text => {
        // Filter AI duplicates
        if (!takenTexts.has(text) && !avoidSet.has(text.toLowerCase())) {
            cluesToReturn.push({
                id: uuidv4(),
                text,
                status: 'pending'
            });
            takenTexts.add(text);
        }
      });
    }

  } catch (error) {
    console.error("Failed to generate clues from AI", error);
    // Fallback if AI fails and we are short
    if (cluesToReturn.length === 0) {
         return Array.from({ length: needed }).map((_, i) => ({
            id: uuidv4(),
            text: `Fallback Clue ${i + 1}`,
            status: 'pending'
        }));
    }
  }

  return cluesToReturn;
};
