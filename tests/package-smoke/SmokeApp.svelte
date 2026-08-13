<script lang="ts">
  import {
    Accordion,
    ActionMenu,
    CodeEditor,
    CommandMenu,
    type CmdAction,
    Dialog,
    DiffView,
    FindBar,
    MultiSelect,
    type Option,
    PageSearch,
    Sheet,
    Tabs,
  } from 'svelte-widgets'
  import DirectActionMenu from 'svelte-widgets/ActionMenu.svelte'
  import DirectCodeEditor from 'svelte-widgets/CodeEditor.svelte'
  import DirectCommandMenu from 'svelte-widgets/CommandMenu.svelte'
  import DirectDialog from 'svelte-widgets/Dialog.svelte'
  import DirectDiffView from 'svelte-widgets/DiffView.svelte'
  import DirectFindBar from 'svelte-widgets/FindBar.svelte'
  import DirectMultiSelect from 'svelte-widgets/MultiSelect.svelte'
  import DirectPageSearch from 'svelte-widgets/PageSearch.svelte'
  import {
    auto_update_position,
    click_outside,
    file_drop,
    register_escape_layer,
  } from 'svelte-widgets/attachments'
  import { BOM, count_lines, editor_text } from 'svelte-widgets/code-editor'
  // oxlint-disable-next-line import/no-unassigned-import -- verifies the CSS export bundles
  import 'svelte-widgets/code-editor/editor.css'
  import { ask_prompt } from 'svelte-widgets/dialogs'
  import { create_find_state } from 'svelte-widgets/find-in-page'
  import { Alert as direct_alert } from 'svelte-widgets/icons'
  import { heading_ids } from 'svelte-widgets/heading-anchors'
  import type { KatexOptions } from 'svelte-widgets/katex'
  import { storage_get } from 'svelte-widgets/storage'
  import { apply_theme_mode as apply_theme_from_subpath } from 'svelte-widgets/theme'
  import { fuzzy_match, get_label } from 'svelte-widgets/utils'

  const options: Option[] = [`One`, { label: `Two`, value: 2 }]
  const actions: CmdAction[] = [{ label: `Open`, action: () => undefined }]
  const katex_options: KatexOptions = { throwOnError: true }
  const package_api_works =
    DirectActionMenu === ActionMenu &&
    DirectCodeEditor === CodeEditor &&
    DirectCommandMenu === CommandMenu &&
    DirectDialog === Dialog &&
    DirectDiffView === DiffView &&
    DirectFindBar === FindBar &&
    DirectMultiSelect === MultiSelect &&
    DirectPageSearch === PageSearch &&
    typeof Accordion === `function` &&
    typeof CodeEditor === `function` &&
    typeof Dialog === `function` &&
    typeof DiffView === `function` &&
    typeof FindBar === `function` &&
    typeof Sheet === `function` &&
    typeof Tabs === `function` &&
    typeof ask_prompt === `function` &&
    typeof auto_update_position === `function` &&
    typeof file_drop === `function` &&
    typeof register_escape_layer === `function` &&
    typeof create_find_state === `function` &&
    count_lines(`one\ntwo`) === 2 &&
    editor_text(`${BOM}a\r\nb`) === `a\nb` &&
    storage_get(`package-smoke-missing`) === null &&
    typeof apply_theme_from_subpath === `function` &&
    typeof heading_ids === `function` &&
    Boolean(direct_alert.d) &&
    katex_options.throwOnError === true &&
    fuzzy_match(`tw`, String(get_label(options[1])))
  let selected = $state<Option[]>([])
</script>

<main {@attach click_outside({ callback: () => undefined })}>
  <MultiSelect bind:selected {options} name="choices" />
  <DirectMultiSelect {options} />
  <DirectCommandMenu {actions} />
  <DirectPageSearch fallback_actions={actions} />
  <p>{package_api_works ? `package ok` : `package failed`}</p>
</main>
