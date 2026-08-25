// Inline code mentions of this repo's files and exports link to their GitHub source
import { create_source_links } from '$lib/source-links'
import * as source_symbols from 'virtual:source-symbols'

export const { link_source_mentions, source_href } = create_source_links(source_symbols)
