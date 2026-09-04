<script lang="ts">
  import {
    Accordion,
    ActionMenu,
    CodeEditor,
    CommandMenu,
    type CmdAction,
    create_editor_model,
    Dialog,
    DiffView,
    FindBar,
    FileInput,
    JsonTree,
    SplitPane,
    TreeView,
    VirtualList,
    TaskStatus,
    Progress,
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
  import DirectJsonTree from 'svelte-widgets/JsonTree.svelte'
  import { virtual_window } from 'svelte-widgets/virtual'
  import DirectFindBar from 'svelte-widgets/FindBar.svelte'
  import DirectMultiSelect from 'svelte-widgets/MultiSelect.svelte'
  import DirectPageSearch from 'svelte-widgets/PageSearch.svelte'
  import {
    auto_update_position,
    click_outside,
    file_drop,
    register_escape_layer,
  } from 'svelte-widgets/attachments'
  import { count_lines } from 'svelte-widgets/code-editor'
  // oxlint-disable-next-line import/no-unassigned-import -- verifies the CSS export bundles
  import 'svelte-widgets/code-editor/editor.css'
  import { ask_prompt } from 'svelte-widgets/dialogs'
  import { create_find_state } from 'svelte-widgets/find-in-page'
  import { Claude as direct_claude } from 'svelte-widgets/icons'
  import { heading_ids } from 'svelte-widgets/heading-anchors'
  import type { KatexOptions } from 'svelte-widgets/katex'
  import { storage_get } from 'svelte-widgets/storage'
  import { apply_theme_mode as apply_theme_from_subpath } from 'svelte-widgets/theme'
  import { fuzzy_match, get_label } from 'svelte-widgets/utils'

  const options: Option[] = [`One`, { label: `Two`, value: 2 }]
  const actions: CmdAction[] = [{ label: `Open`, action: () => undefined }]
  const katex_options: KatexOptions = { throwOnError: true }
  const editor_model = create_editor_model({ uri: `memory:smoke`, text: `a\r\nb` })
  const package_api_works =
    DirectActionMenu === ActionMenu &&
    DirectCodeEditor === CodeEditor &&
    DirectCommandMenu === CommandMenu &&
    DirectDialog === Dialog &&
    DirectDiffView === DiffView &&
    DirectFindBar === FindBar &&
    DirectJsonTree === JsonTree &&
    [FileInput, SplitPane, TreeView, VirtualList, TaskStatus, Progress].every(
      (component) => typeof component === `function`,
    ) &&
    virtual_window({ scroll: 0, viewport: 100, count: 1000, item_size: 20 }).end === 5 &&
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
    editor_model.text() === `a\nb` &&
    editor_model.line_count === 2 &&
    storage_get(`package-smoke-missing`) === null &&
    typeof apply_theme_from_subpath === `function` &&
    typeof heading_ids === `function` &&
    Boolean(direct_claude.d) &&
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
