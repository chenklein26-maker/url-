import { GoogleGenAI } from "@google/genai";

export type AIProvider = 'gemini' | 'deepseek' | 'openai';

export interface AIServiceConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface PolishParams {
  title: string;
  content: string;
  prompt: string;
}

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  async polishArticle(params: PolishParams): Promise<string> {
    const systemPrompt = `你是一位经验丰富的编辑。请严格按照以下要求润色文章，并输出为标准的 HTML 格式（仅包含 <p>, <strong>, <a> 等标签，不要包含 <html> 或 <body>）：
要求：${params.prompt}

待处理内容：
标题：${params.title}
正文：${params.content}

请直接输出润色后的 HTML 全文。注意：
1. 忽略任何导航菜单、面包屑、页脚或其他非正文内容。
2. 不要包含任何多余的解释、Markdown 代码块标记（如 \`\`\`html）或注释。
3. 严格遵循 HTML 结构要求（<p>\n\t...）。`;

    if (this.config.provider === 'gemini') {
      return this.callGemini(systemPrompt);
    } else {
      return this.callOpenAICompatible(systemPrompt);
    }
  }

  private async callGemini(prompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    const response = await ai.models.generateContent({
      model: this.config.model || "gemini-3-flash-preview",
      contents: prompt,
    });
    let text = response.text || '';
    return this.cleanHtml(text);
  }

  private async callOpenAICompatible(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl || (this.config.provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1');
    const model = this.config.model || (this.config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    let text = data.choices[0]?.message?.content || '';
    return this.cleanHtml(text);
  }

  private cleanHtml(text: string): string {
    return text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
}
