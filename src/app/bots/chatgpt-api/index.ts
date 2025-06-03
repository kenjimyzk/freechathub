import { isArray } from 'lodash-es'
import { DEFAULT_CHATGPT_SYSTEM_MESSAGE } from '~app/consts'
import { UserConfig } from '~services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { file2base64 } from '../bing/utils'
import { ChatMessage } from './types'

interface ConversationContext {
  messages: ChatMessage[]
}

const CONTEXT_SIZE = 9

export abstract class AbstractChatGPTApiBot extends AbstractBot {
  private conversationContext?: ConversationContext

  private buildUserMessage(prompt: string, imageUrl?: string): ChatMessage {
    if (!imageUrl) {
      return { role: 'user', content: prompt }
    }
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
      ],
    }
  }

  private buildMessages(prompt: string, imageUrl?: string): ChatMessage[] {
    const currentDate = new Date().toISOString().split('T')[0]
    const systemMessage = this.getSystemMessage().replace('{current_date}', currentDate)
    return [
      { role: 'system', content: systemMessage },
      ...this.conversationContext!.messages.slice(-(CONTEXT_SIZE + 1)),
      this.buildUserMessage(prompt, imageUrl),
    ]
  }

  getSystemMessage() {
    return DEFAULT_CHATGPT_SYSTEM_MESSAGE
  }

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    let imageUrl: string | undefined
    if (params.image) {
      imageUrl = await file2base64(params.image, true)
    }

    const resp = await this.fetchCompletionApi(this.buildMessages(params.prompt, imageUrl), params.signal)

    // add user message to context only after fetch success
    this.conversationContext.messages.push(this.buildUserMessage(params.rawUserInput || params.prompt, imageUrl))

    let done = false
    const result: ChatMessage = { role: 'assistant', content: '' }

    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      const messages = this.conversationContext!.messages
      messages.push(result)
    }

    await parseSSEResponse(resp, (message) => {
      console.debug('chatgpt sse message', message)
      if (message === '[DONE]') {
        finish()
        return
      }
      let data
      try {
        data = JSON.parse(message)
      } catch (err) {
        console.error(err)
        return
      }
      if (data?.choices?.length) {
        const delta = data.choices[0].delta
        if (delta?.content) {
          result.content += delta.content
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: { text: result.content },
          })
        }
      }
    })

    if (!done) {
      finish()
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  abstract fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal): Promise<Response>
}

export class ChatGPTApiBot extends AbstractChatGPTApiBot {
  constructor(
    private config: Pick<
      UserConfig,
      'openaiApiKey' | 'openaiApiHost' | 'chatgptApiModel' | 'chatgptApiTemperature' | 'chatgptApiSystemMessage'
    >,
  ) {
    super()
  }

  getSystemMessage() {
    return this.config.chatgptApiSystemMessage || DEFAULT_CHATGPT_SYSTEM_MESSAGE
  }

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal) {
    const { openaiApiKey, openaiApiHost } = this.config
    const hasImageInput = messages.some(
      (message) => isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
    )

    const selectedModel = this.getModelName()
    let modelToUse = selectedModel

    // Models known to support vision directly from CHATGPT_API_MODELS (ensure this list is accurate)
    const visionDirectlySupportedModels = [
      'gpt-4o',
      'gpt-4o-2024-05-13',
      'gpt-4-turbo', // General gpt-4-turbo is expected to support vision
      'gpt-4-turbo-2024-04-09',
      'gpt-4-0125-preview', // Preview model, likely supports vision
      // 'gpt-4-vision-preview' itself is a vision model, though we aim to use the primary selected model if it's capable
    ]

    if (hasImageInput) {
      if (!visionDirectlySupportedModels.includes(selectedModel) && selectedModel !== 'gpt-4-vision-preview') {
        // If the selected model isn't known for vision, switch to 'gpt-4o' as a capable default.
        // (gpt-4-vision-preview could also be used, but gpt-4o is newer)
        modelToUse = 'gpt-4o'
      }
      // If selectedModel is in visionDirectlySupportedModels or is 'gpt-4-vision-preview', modelToUse remains selectedModel.
    }

    const resp = await fetch(`${openaiApiHost}/v1/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        max_tokens: hasImageInput ? 4096 : undefined, // Updated max_tokens for vision
        stream: true,
      }),
    })
    if (!resp.ok) {
      const error = await resp.text()
      if (error.includes('insufficient_quota')) {
        throw new ChatError('Insufficient ChatGPT API usage quota', ErrorCode.CHATGPT_INSUFFICIENT_QUOTA)
      }
    }
    return resp
  }

  private getModelName() {
    const { chatgptApiModel } = this.config
    // The CHATGPT_API_MODELS list in consts.ts now contains specific and up-to-date model IDs.
    // So, in most cases, the chatgptApiModel from config can be returned directly.
    // Add specific hardcoded mappings here only if a user-selected alias from CHATGPT_API_MODELS
    // (e.g., a generic 'gpt-4-turbo' if it were an alias) needs to point to a *different*
    // specific model ID for the API call (e.g., 'gpt-4-turbo-2024-04-09').
    // Given the current CHATGPT_API_MODELS, direct use is generally correct.
    return chatgptApiModel
  }

  get name() {
    return `ChatGPT (API/${this.config.chatgptApiModel})`
  }

  get supportsImageInput() {
    return true
  }
}
