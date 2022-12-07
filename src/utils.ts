import type { ChatGPTAPI, ConversationResponseEvent } from 'chatgpt'
import winkNLPModel from 'wink-eng-lite-web-model'
import winkNLP from 'wink-nlp'

import * as types from './types'

const nlp = winkNLP(winkNLPModel)

/**
 * Converts a ChatGPT response string to an array of tweet-sized strings.
 */
export function getTweetsFromResponse(response: string): string[] {
  const paragraphs = response
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)

  // const sentences = paragraphs.map((p) => p.sentences().out())
  let tweetDrafts = []
  const maxTweetLength = 250
  let currentTweet = ''

  for (const paragraph of paragraphs) {
    const doc = nlp.readDoc(paragraph)
    let sentences = doc.sentences().out()
    for (let i = 0; i < sentences.length - 1; ++i) {
      const s0 = sentences[i]
      const s1 = sentences[i + 1]
      if (s0.endsWith('.') && /^(js|ts|jsx|tsx)\b/.test(s1)) {
        sentences[0] = `${s0}${s1}`
        sentences.splice(i + 1, 1)
      }
    }
    // console.log(JSON.stringify(sentences, null, 2))

    for (let sentence of sentences) {
      do {
        if (currentTweet.length > 200) {
          tweetDrafts.push(currentTweet)
          currentTweet = ''
        }

        const tweet = currentTweet ? `${currentTweet}\n\n${sentence}` : sentence

        if (tweet.length > maxTweetLength) {
          const tokens = sentence.split(' ')
          let partialTweet = currentTweet ? `${currentTweet}\n\n` : ''
          let partialNextSentence = ''
          let isNext = false

          for (const token of tokens) {
            const temp = `${partialTweet}${token} `
            if (!isNext && temp.length < maxTweetLength) {
              partialTweet = temp
            } else {
              isNext = true
              partialNextSentence = `${partialNextSentence}${token} `
            }
          }

          if (partialTweet.length > maxTweetLength) {
            console.error(
              'error: unexptected tweet length too long',
              partialTweet
            )
          }

          tweetDrafts.push(partialTweet.trim() + '...')
          currentTweet = ''
          sentence = partialNextSentence
        } else {
          currentTweet = tweet.trim()
          break
        }
      } while (sentence.trim().length)
    }
  }

  if (currentTweet) {
    tweetDrafts.push(currentTweet.trim())
    currentTweet = null
  }

  tweetDrafts = tweetDrafts.map((t) => t.trim()).filter(Boolean)
  console.log(tweetDrafts.length, JSON.stringify(tweetDrafts, null, 2))

  const tweets = tweetDrafts.map((draft, index) => {
    if (tweetDrafts.length > 1) {
      return `${index + 1}/${tweetDrafts.length} ${draft}`
    } else {
      return draft
    }
  })

  return tweets
}

/**
 * Asks ChatGPT for a response to a prompt
 */
export async function getChatGPTResponse(
  prompt: string,
  {
    chatgpt,
    stripMentions = false,
    conversationId,
    parentMessageId
  }: {
    chatgpt: ChatGPTAPI
    stripMentions?: boolean
    conversationId?: string
    parentMessageId?: string
  }
): Promise<types.ChatGPTResponse> {
  let response: string
  let messageId: string

  const onConversationResponse = (res: ConversationResponseEvent) => {
    if (res.conversation_id) {
      conversationId = res.conversation_id
    }

    if (res.message?.id) {
      messageId = res.message.id
    }
  }

  const timeoutMs = 2 * 60 * 1000 // 2 minutes
  try {
    console.log('chatgpt.sendMessage', prompt, {
      conversationId,
      parentMessageId
    })
    response = await chatgpt.sendMessage(prompt, {
      timeoutMs: timeoutMs,
      conversationId,
      parentMessageId,
      onConversationResponse
    })
  } catch (err: any) {
    console.error('ChatGPT error', {
      prompt,
      error: err
    })

    throw new Error(`ChatGPT error: ${err.toString()}`)
  }

  response = response?.trim()
  if (stripMentions) {
    response = stripAtMentions(response)?.trim()
  }

  if (!response) {
    throw new Error(`ChatGPT received an empty response`)
  }

  return {
    response,
    messageId,
    conversationId
  }
}

function stripAtMentions(text?: string) {
  return text?.replaceAll(/\b\@([a-zA-Z0-9_]+\b)/g, '$1')
}

export function pick<T extends object>(obj: T, ...keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => key in obj).map((key) => [key, obj[key]])
  ) as T
}

export function omit<T extends object>(obj: T, ...keys: string[]) {
  return Object.fromEntries<T>(
    Object.entries(obj).filter(([key]) => !keys.includes(key))
  ) as T
}
