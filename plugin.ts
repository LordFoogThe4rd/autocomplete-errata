import { definePlugin } from '@tealios/errata-plugin-sdk'
import type { WritingPlugin } from '@tealios/errata-plugin-sdk'

const plugin: WritingPlugin = definePlugin({
  manifest: {
    name: 'autocomplete',
    version: '1.1.0',
    description: 'Model refusing to write your story with instruct mode? Just make it autocomplete! Works most of the time.',
    panel: { title: 'Autocomplete' },
  },
})

export default plugin
