// Simple wrapper for LM Studio API
export class LMStudioClient {
    constructor(config) {
      this.baseUrl = config.baseUrl;
      this.headers = config.headers || {};
    }
  
    llm = {
      model: async () => {
        return {
          respond: async (messages) => {
            const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                ...this.headers,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'qwen3-8b',
                messages: messages,
                temperature: 0.7,
                stream: false
              })
            });
  
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
  
            const data = await response.json();
            return data.choices[0].message.content;
          }
        };
      }
    };
  }