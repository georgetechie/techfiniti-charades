# Charades AI Party 🎭

**Charades AI Party** is a modern, multiplayer web application that modernizes the classic party game. It utilizes **PeerJS** for serverless, peer-to-peer connections between devices and **Google Gemini AI** to generate infinite, context-aware clues.

## ✨ Features

### 🎮 Gameplay Modes
*   **Online Multiplayer**: One user acts as the Host (Moderator) on a main screen (TV/Laptop), while other players join via their smartphones using a 6-character room code.
*   **Single Device (Pass & Play)**: A local mode where a single device is passed around between teams.

### 🤖 AI-Powered Content
*   **Infinite Clues**: Never run out of words. Clues are generated on-the-fly using Google's Gemini 2.5 Flash model.
*   **Smart Categories**: Choose from Movies, Bible, Actions, Famous People, or a "Random" mix.
*   **Duplicate Prevention**: The AI is context-aware and filters out clues that have already been used in the current session.

### ⚡ Robust Networking
*   **P2P Architecture**: No backend server required for game logic. The Host's browser acts as the "server."
*   **Auto-Reconnect**: Handles app switching, screen sleep, and network blips gracefully.
*   **State Hydration**: Players can refresh their browsers without losing their spot in the game.

### 🎨 Rich UI/UX
*   **Team Management**: Drag-and-drop style logic to move players, shuffle teams, or kick users.
*   **Custom Avatars**: Integration with DiceBear for fun, unique player avatars.
*   **Configurable Rules**: Adjust round timers, winning scores, and interface messages.

---

## 🛠️ Tech Stack

*   **Frontend**: React 19, TypeScript
*   **Styling**: Tailwind CSS
*   **AI**: @google/genai SDK (Gemini 2.5 Flash)
*   **Networking**: PeerJS (WebRTC wrapper)
*   **Utilities**: UUID (Unique IDs), React DOM

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   A Google AI Studio API Key

### Installation

1.  **Clone or Download the repository**
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
    *Note: Ensure you have `peerjs`, `@google/genai`, `react`, `react-dom`, `uuid` installed.*

3.  **Environment Setup**:
    Create a `.env` file in the root directory and add your Google API Key:
    ```env
    API_KEY=your_google_gemini_api_key_here
    ```

4.  **Run the App**:
    ```bash
    npm start
    # or
    npm run dev
    ```

---

## 🕹️ How to Play

### Online Mode
1.  **Host**:
    *   Click "Host a New Game".
    *   Enter your name.
    *   Share the displayed **6-character Room Code** with your friends.
    *   Use the "Lobby" controls to add teams, shuffle players, or lock the game.
    *   Click "Start Game Setup" to configure categories and generate clues.
    *   Click "Start Playing".

2.  **Player**:
    *   Open the app on your phone.
    *   Select "Join Existing Game".
    *   Enter your name and the Room Code.
    *   Wait for your turn! When you are the actor, you can reveal the clue and start the timer.

### Single Device Mode
1.  Select "Single Device Play" from the landing screen.
2.  Add/Remove Teams and rename them if desired.
3.  Configure game settings (Time per round, number of clues).
4.  The app will guide you to pass the device to the active team.

---

## 📂 Project Structure

*   **`App.tsx`**: Main routing logic and role selection.
*   **`services/network.ts`**: The core networking brain. Handles PeerJS connections, state synchronization, and reconnection logic.
*   **`services/geminiService.ts`**: Handles interaction with the Google GenAI API to fetch and filter clues.
*   **`views/HostView.tsx`**: The dashboard for the game moderator. Handles timer logic, scoring, and state management.
*   **`views/PlayerView.tsx`**: The mobile-first interface for players. Shows status, current actor, and controls for the active player.
*   **`views/SingleDeviceView.tsx`**: Self-contained logic for the local Pass & Play mode.

---

## ⚠️ Networking Note
This application uses **PeerJS**. By default, it connects to the public PeerJS cloud server to broker connections.
*   If deploying to production, it is recommended to host your own PeerJS server or ensuring your firewall allows WebRTC traffic.
*   Users must generally be on the same network or have unrestricted internet access for WebRTC negotiation to succeed.

---

## 📄 License
MIT
