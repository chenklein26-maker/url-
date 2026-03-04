# AI Maintenance Guide: Gemini API Key Configuration

This document provides instructions for an AI agent or developer on how to configure and replace the Gemini API key in this project.

## 1. Key Location in Code
The AI configuration is managed via the `aiConfig` state in `src/App.tsx`. It defaults to Gemini but can be switched to DeepSeek or OpenAI.
The actual API calls are abstracted in `src/services/aiService.ts`.
```typescript
const [aiConfig, setAiConfig] = useState<AIServiceConfig>(() => {
  const saved = localStorage.getItem('article_flow_ai_config');
  return saved ? JSON.parse(saved) : {
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-3-flash-preview'
  };
});
```

## 2. How to Replace the Key

### Method A: Environment Variables (Recommended)
The most secure way to manage the key is through environment variables.
1. Create a `.env` file in the root directory (if it doesn't exist).
2. Add or update the following line:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

### Method B: AI Studio Platform (Preview Environment)
If running within the AI Studio preview environment:
1. Do NOT hardcode the key in the source code.
2. The platform automatically injects the key into `process.env.GEMINI_API_KEY` from the user's secrets configuration.
3. To update it, use the platform's "Secrets" or "API Key" selection UI.

### Method C: Electron Production Build
When packaging the app for Electron:
1. Ensure the environment variable is available to the process before startup.
2. You can use a library like `dotenv` in `electron-main.cjs` to load variables from a `.env` file:
   ```javascript
   require('dotenv').config();
   ```

## 3. Verification
To verify if the key is correctly set:
1. Start the application.
2. Open the "Robot Assistant" or check the console for initialization errors.
3. Attempt a task that requires AI (e.g., adding a URL for extraction). If the key is invalid, the Robot will report an "API Error" or "Unauthorized" status.

## 4. Security Warning
- **Never** commit the actual API key to version control (Git).
- Ensure `.env` is listed in `.gitignore`.
- If a key is accidentally exposed, revoke it immediately at the provider's dashboard.

## 5. Adding New AI Providers
The project uses a unified `AIService` (`src/services/aiService.ts`) to handle AI calls. To add a new provider (e.g., Claude):

1. **Update Types**: Add the new provider name to the `AIProvider` type in `src/services/aiService.ts`.
2. **Implement Logic**: Add a new `case` or `if` branch in the `polishArticle` method. Most providers use OpenAI-compatible APIs, so you can likely reuse `callOpenAICompatible` by setting the correct `baseUrl`.
3. **Update UI**: Add a new button for the provider in the "AI 模型设置" section of `src/App.tsx`.

## 6. DeepSeek / OpenAI Configuration
- **DeepSeek**: Select "DEEPSEEK" in Settings. The default base URL is `https://api.deepseek.com/v1`.
- **OpenAI**: Select "OPENAI" in Settings. The default base URL is `https://api.openai.com/v1`.
- **Custom**: You can override the `baseUrl` and `model` name in the Settings UI for any OpenAI-compatible service.
