import { defaults } from 'lodash-es'
import Browser from 'webextension-polyfill'
import { BotId } from '~app/bots'
import { ALL_IN_ONE_PAGE_ID, CHATBOTS, CHATGPT_API_MODELS, DEFAULT_CHATGPT_SYSTEM_MESSAGE } from '~app/consts'

export enum BingConversationStyle {
  Creative = 'creative',
  Balanced = 'balanced',
  Precise = 'precise',
}

export enum ChatGPTMode {
  Webapp = 'webapp',
  API = 'api',
  Azure = 'azure',
  Poe = 'poe',
  OpenRouter = 'openrouter',
}

export enum ChatGPTWebModel {
  'GPT-3.5' = 'gpt-3.5',
  'GPT-4' = 'gpt-4',
}

export enum PoeGPTModel {
  'GPT-3.5' = 'chinchilla',
  'GPT-4' = 'beaver',
}

export enum PoeClaudeModel {
  'claude-instant' = 'a2',
  'claude-instant-100k' = 'a2_100k',
  'claude-2-100k' = 'a2_2',
}

export enum ClaudeMode {
  Webapp = 'webapp',
  API = 'api',
  Poe = 'poe',
  OpenRouter = 'openrouter',
}

export enum ClaudeAPIModel {
  'claude-3-opus-20240229' = 'claude-3-opus-20240229',
  'claude-3-sonnet-20240229' = 'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307' = 'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20240620' = 'claude-3-5-sonnet-20240620',
  'claude-2' = 'claude-2', // Kept for backward compatibility
  'claude-instant-1' = 'claude-instant-v1', // Kept for backward compatibility
}

export enum GeminiAPIModel {
  'gemini-1.5-pro-latest' = 'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest' = 'gemini-1.5-flash-latest',
  'gemini-pro' = 'gemini-pro',
}

export enum OpenRouterClaudeModel {
  'claude-2' = 'claude-2',
  'claude-instant-v1' = 'claude-instant-v1',
}

export enum PerplexityMode {
  Webapp = 'webapp',
  API = 'api',
}

const userConfigWithDefaultValue = {
  openaiApiKey: '',
  openaiApiHost: 'https://api.openai.com',
  chatgptApiModel: 'gpt-4o' as (typeof CHATGPT_API_MODELS)[number],
  chatgptApiTemperature: 1,
  chatgptApiSystemMessage: DEFAULT_CHATGPT_SYSTEM_MESSAGE,
  chatgptMode: ChatGPTMode.Webapp,
  chatgptWebappModelName: ChatGPTWebModel['GPT-3.5'],
  chatgptPoeModelName: PoeGPTModel['GPT-3.5'],
  startupPage: ALL_IN_ONE_PAGE_ID,
  bingConversationStyle: BingConversationStyle.Balanced,
  poeModel: PoeClaudeModel['claude-instant'],
  azureOpenAIApiKey: '',
  azureOpenAIApiInstanceName: '',
  azureOpenAIApiDeploymentName: '',
  enabledBots: Object.keys(CHATBOTS).slice(0, 8) as BotId[],
  claudeApiKey: '',
  claudeMode: ClaudeMode.Webapp,
  claudeApiModel: ClaudeAPIModel['claude-3-5-sonnet-20240620'],
  chatgptWebAccess: false,
  claudeWebAccess: false,
  openrouterOpenAIModel: CHATGPT_API_MODELS[0] as (typeof CHATGPT_API_MODELS)[number],
  openrouterClaudeModel: OpenRouterClaudeModel['claude-2'],
  openrouterApiKey: '',
  perplexityMode: PerplexityMode.Webapp,
  perplexityApiKey: '',
  geminiApiKey: '',
  geminiApiModel: GeminiAPIModel['gemini-1.5-pro-latest'],
}

export type UserConfig = typeof userConfigWithDefaultValue

export async function getUserConfig(): Promise<UserConfig> {
  const result = await Browser.storage.sync.get(Object.keys(userConfigWithDefaultValue))
  if (!result.chatgptMode && result.openaiApiKey) {
    result.chatgptMode = ChatGPTMode.API
  }
  if (result.chatgptWebappModelName === 'default') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-3.5']
  } else if (result.chatgptWebappModelName === 'gpt-4-browsing') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-4']
  } else if (result.chatgptWebappModelName === 'gpt-3.5-mobile') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-3.5']
  } else if (result.chatgptWebappModelName === 'gpt-4-mobile') {
    result.chatgptWebappModelName = ChatGPTWebModel['GPT-4']
  }
  // ChatGPT model migration: Ensure the model is still valid, otherwise default to gpt-4o
  if (result.chatgptApiModel && !CHATGPT_API_MODELS.includes(result.chatgptApiModel as any)) {
    // Map known old models
    if (result.chatgptApiModel === 'gpt-3.5-turbo-16k') {
      result.chatgptApiModel = 'gpt-3.5-turbo'
    } else if (result.chatgptApiModel === 'gpt-4-32k') {
      result.chatgptApiModel = 'gpt-4'
    } else {
      // Default to gpt-4o if not a recognized old model or not in the current list
      result.chatgptApiModel = 'gpt-4o'
    }
  }
  // If still not a valid model after potential migration, set to default
  if (result.chatgptApiModel && !CHATGPT_API_MODELS.includes(result.chatgptApiModel as any)) {
    result.chatgptApiModel = userConfigWithDefaultValue.chatgptApiModel
  }


  // Claude model migration: Ensure the model is still valid, otherwise default to claude-3-5-sonnet-20240620
  const validClaudeModels = Object.values(ClaudeAPIModel)
  if (result.claudeApiModel && !validClaudeModels.includes(result.claudeApiModel as any)) {
    // Add specific migration logic here if needed, e.g.,
    // if (result.claudeApiModel === 'some-very-old-model') {
    //   result.claudeApiModel = ClaudeAPIModel['claude-2']
    // } else {
    //   result.claudeApiModel = ClaudeAPIModel['claude-3-5-sonnet-20240620']
    // }
    // For now, directly default to the latest if not recognized
    result.claudeApiModel = userConfigWithDefaultValue.claudeApiModel
  }

  // Gemini model will be initialized by defaults if not present

  return defaults(result, userConfigWithDefaultValue)
}

export async function updateUserConfig(updates: Partial<UserConfig>) {
  console.debug('update configs', updates)
  await Browser.storage.sync.set(updates)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      await Browser.storage.sync.remove(key)
    }
  }
}
