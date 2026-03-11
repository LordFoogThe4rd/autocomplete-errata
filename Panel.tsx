import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Loader2, Lock } from 'lucide-react'
import type { PluginPanelProps } from '@/lib/plugin-panels'
import { api } from '@/lib/api'

// Helper to generate a fragment ID similar to how the server does it
const CONSONANTS = 'bdfgkmnprstvz'
const VOWELS = 'aeiou'
const generateFragmentId = (type: string) => {
  const prefix = type === 'prose' ? 'pr' : type.slice(0, 4)
  const chars: string[] = []
  for (let i = 0; i < 6; i++) {
    const pool = i % 2 === 0 ? CONSONANTS : VOWELS
    chars.push(pool[Math.floor(Math.random() * pool.length)])
  }
  return `${prefix}-${chars.join('')}`
}

export function AutocompletePanel({ storyId }: PluginPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const storageKey = `errata:autocomplete:config:${storyId}`

  const [apiKey, setApiKey] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).apiKey ?? '' } catch (e) {} return ''
  })
  const [includeMetaFragments, setIncludeMetaFragments] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).includeMetaFragments ?? false } catch (e) {} return false
  })
  const [appendToLastFragment, setAppendToLastFragment] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).appendToLastFragment ?? false } catch (e) {} return false
  })
  const [temperature, setTemperature] = useState<number | string>(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).temperature ?? 0.7 } catch (e) {} return 0.7
  })
  const [metaProseSeparator, setMetaProseSeparator] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).metaProseSeparator ?? '\\n***\\n' } catch (e) {} return '\\n***\\n'
  })
  const [newlineFormatting, setNewlineFormatting] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).newlineFormatting ?? 'preserve' } catch (e) {} return 'preserve'
  })
  const [customEndpoint, setCustomEndpoint] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).customEndpoint ?? 'http://localhost:11434/v1' } catch (e) {} return 'http://localhost:11434/v1'
  })
  const [customModel, setCustomModel] = useState(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s).customModel ?? '' } catch (e) {} return ''
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        apiKey,
        includeMetaFragments,
        appendToLastFragment,
        temperature,
        metaProseSeparator,
        newlineFormatting,
        customEndpoint,
        customModel,
      }))
    } catch (e) {}
  }, [storageKey, apiKey, includeMetaFragments, appendToLastFragment, temperature, metaProseSeparator, newlineFormatting, customEndpoint, customModel])

  const handleGenerate = async () => {
    if (!customEndpoint || !customModel) {
      setError('Custom Endpoint and Model Name are required.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      // 1. Fetch fragments from Errata API
      const fragments = await api.fragments.list(storyId)

      // 2. Prompt Assembly (Ported from server-side)
      const proseFragments = fragments.filter((f: any) => f.type === 'prose')
      const proseContent = proseFragments.map((f: any) => f.content).join('\n')

      let source = proseContent
      
      if (includeMetaFragments) {
        const metaContent = fragments
          .filter((f: any) => ['guideline', 'character', 'knowledge'].includes(f.type))
          .map((f: any) => f.content)
          .join('\n')

        if (metaContent) {
          const sep = metaProseSeparator.replace(/\\n/g, '\n')
          source = `${metaContent}${sep}${proseContent}`
        }
      }

      if (!appendToLastFragment) {
        source += '\n'
      }

      let stopSequence = ['\n']
      if (newlineFormatting === 'force-single') {
        source = source.replace(/\n{2,}/g, '\n')
      } else if (newlineFormatting === 'force-double') {
        source = source.replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n')
        stopSequence = ['\n\n']
      }

      // 3. LLM Call
      let url = customEndpoint.replace(/\/$/, '')
      if (!url.endsWith('/completions')) {
        url = url.endsWith('/v1') ? `${url}/completions` : `${url}/v1/completions`
      }

      const llmRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: customModel,
          prompt: source,
          stop: stopSequence,
          stream: false,
          temperature: Number(temperature) || 0.7
        })
      })

      if (!llmRes.ok) {
        const errorText = await llmRes.text().catch(() => 'No error text')
        throw new Error(`Completion API failed: ${llmRes.status} ${llmRes.statusText} - ${errorText}`)
      }
      
      const llmData = await llmRes.json()
      const generatedText = llmData?.choices?.[0]?.text

      if (typeof generatedText !== 'string') {
        throw new Error('Invalid response from completion API: missing or invalid text')
      }

      // 4. Save Results (Host API)
      if (appendToLastFragment) {
        const lastFragment = proseFragments[proseFragments.length - 1]
        if (lastFragment) {
          await api.fragments.edit(storyId, lastFragment.id, {
            oldText: lastFragment.content,
            newText: `${lastFragment.content}${generatedText}`,
          })
        }
      } else {
        const newFragmentId = generateFragmentId('prose')
        await api.fragments.create(storyId, {
          id: newFragmentId,
          type: 'prose',
          name: 'Autocomplete',
          description: 'Generated via autocomplete plugin',
          content: generatedText,
          tags: [],
          meta: {},
        })

        await api.proseChain.addSection(storyId, newFragmentId)
      }

      // 5. Invalidate
      window.dispatchEvent(new CustomEvent('errata:plugin:invalidate'))
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Autocomplete</h2>
        <p className="text-sm text-muted-foreground">
          Client-side text continuations via raw completions.
        </p>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4">
        <div className="space-y-6 pb-4">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
              LLM Configuration
            </h3>

            <div className="space-y-3 rounded-md border p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-3 w-3 text-muted-foreground" />
                <label htmlFor="apiKey" className="text-sm font-medium leading-none">
                  API Key (Stored Locally)
                </label>
              </div>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your key is stored in your browser's localStorage.
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label htmlFor="customEndpoint" className="text-sm font-medium leading-none">
                Endpoint URL
              </label>
              <Input
                id="customEndpoint"
                type="text"
                placeholder="http://localhost:11434/v1"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label htmlFor="customModel" className="text-sm font-medium leading-none">
                Model Name
              </label>
              <Input
                id="customModel"
                type="text"
                placeholder="gpt-3.5-turbo-instruct"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
              />
            </div>

            <div className="py-2">
              <Separator />
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
              Generation Settings
            </h3>

            <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <Checkbox 
                id="includeMeta" 
                checked={includeMetaFragments} 
                onCheckedChange={(checked) => setIncludeMetaFragments(checked as boolean)}
              />
              <div className="space-y-1 leading-none">
                <label htmlFor="includeMeta" className="text-sm font-medium">
                  Include Meta Fragments
                </label>
                <p className="text-xs text-muted-foreground">
                  Include guidelines or character sheets in context.
                </p>
              </div>
            </div>

            <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <Checkbox 
                id="appendToLast" 
                checked={appendToLastFragment} 
                onCheckedChange={(checked) => setAppendToLastFragment(checked as boolean)}
              />
              <div className="space-y-1 leading-none">
                <label htmlFor="appendToLast" className="text-sm font-medium">
                  Append to Last Fragment
                </label>
                <p className="text-xs text-muted-foreground">
                  Don't create a new fragment, just add to the end of the last one.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex justify-between items-center">
                <label htmlFor="temperature" className="text-sm font-medium leading-none">
                  Temperature
                </label>
                <span className="text-sm text-muted-foreground">{temperature}</span>
              </div>
              <Input
                id="temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label htmlFor="metaProseSeparator" className="text-sm font-medium leading-none">
                Meta/Prose Separator
              </label>
              <Input
                id="metaProseSeparator"
                type="text"
                value={metaProseSeparator}
                onChange={(e) => setMetaProseSeparator(e.target.value)}
                disabled={!includeMetaFragments}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label className="text-sm font-medium leading-none">
                Newline Formatting
              </label>
              <Tabs
                value={newlineFormatting}
                onValueChange={setNewlineFormatting}
                className="w-full"
              >
                <TabsList className="w-full">
                  <TabsTrigger value="preserve" className="text-xs flex-1">Preserve</TabsTrigger>
                  <TabsTrigger value="force-single" className="text-xs flex-1">Single</TabsTrigger>
                  <TabsTrigger value="force-double" className="text-xs flex-1">Double</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground mt-2">
                Format the context sent to the model to influence output style.
              </p>
            </div>
          </div>

          <Button 
            className="w-full" 
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Generating...' : 'Generate Completion'}
          </Button>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
          
          {success && (
            <div className="text-sm text-emerald-500 bg-emerald-500/10 p-3 rounded-md">
              Completion generated and saved!
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
