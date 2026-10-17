<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Language } from "$lib/core/components/code";
  import { Button, EmptyState, IconButton, Input, Segmented, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import {
    DownloadSimple as DownloadSimpleIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    PaperPlaneTilt as PaperPlaneTiltIcon,
    Plus as PlusIcon,
    Trash as TrashIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import CodeView from "./code-view.svelte";
  import { download, downloads_folder } from "./download";
  import { empty_request, parse_http, serialize_http, type HttpDocument, type HttpRequest, type Pair } from "./http-file";
  import { APP_ID, HTTP_FILES, METHODS } from "./methods";
  import PairsEditor from "./pairs-editor.svelte";
  import {
    body_kind,
    BodyKind,
    download_name,
    explain_fetch_error,
    format_pairs,
    header_value,
    parse_pairs,
    prepare,
    query_params,
    with_body_kind,
    with_query,
    type FetchProblem,
    type Prepared,
  } from "./request";
  import ResponseView from "./response-view.svelte";
  import { pretty_json, send, type ApiResponse } from "./send";

  const { path: initial_path }: { path?: string } = $props();

  const { window_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const Tab = { PARAMS: "params", HEADERS: "headers", BODY: "body", VARIABLES: "variables" } as const;
  type Tab = (typeof Tab)[keyof typeof Tab];
  const Panel = { REQUEST: "request", RESPONSE: "response" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const fresh = (): HttpDocument => ({ variables: [], requests: [empty_request()] });

  let doc = $state<HttpDocument>(fresh());
  let path = $state<string | null>(null);
  let saved_text = $state(serialize_http(fresh()));
  let selected = $state(0);
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let tab = $state<Tab>(Tab.PARAMS);
  let panel = $state<Panel>(Panel.REQUEST);

  let response = $state.raw<ApiResponse | null>(null);
  let problem = $state.raw<FetchProblem | null>(null);
  let controller = $state.raw<AbortController | null>(null);
  let sent_to = $state("");

  const current = $derived(doc.requests[Math.min(selected, doc.requests.length - 1)]);
  const dirty = $derived(serialize_http(doc) !== saved_text);
  const name = $derived(path ? base_name(path) : "Untitled.http");
  const params = $derived(query_params(current.url));
  const kind = $derived(body_kind(current));
  const method_options = $derived(
    [...new Set<string>([...METHODS, current.method])].map((method) => ({ value: method, label: method }))
  );
  const request_options = $derived(doc.requests.map((request, index) => ({ value: String(index), label: request_label(request, index) })));
  const tabs = $derived([
    { value: Tab.PARAMS, label: count("Params", params.length) },
    { value: Tab.HEADERS, label: count("Headers", current.headers.length) },
    { value: Tab.BODY, label: "Body" },
    { value: Tab.VARIABLES, label: count("Variables", doc.variables.length) },
  ]);

  function count(label: string, value: number) {
    return value > 0 ? `${label} ${value}` : label;
  }

  function request_label(request: HttpRequest, index: number) {
    return request.name || request.url || `Request ${index + 1}`;
  }

  function update(patch: Partial<HttpRequest>) {
    doc.requests[selected] = { ...current, ...patch };
  }

  function set_kind(next: BodyKind) {
    doc.requests[selected] = with_body_kind(current, next);
  }

  function select(index: number) {
    selected = index;
    panel = Panel.REQUEST;
  }

  function add_request() {
    doc.requests.push(empty_request());
    select(doc.requests.length - 1);
  }

  async function remove_request() {
    const label = request_label(current, selected);
    if (!(await win.confirm(`Delete “${label}”?`, { confirm_label: "Delete", danger: true }))) return;
    doc.requests.splice(selected, 1);
    if (doc.requests.length === 0) doc.requests.push(empty_request());
    selected = Math.min(selected, doc.requests.length - 1);
  }

  function report(title: string, reason: unknown) {
    notifications.notify(APP_ID, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  async function load(target: string) {
    loading = true;
    load_error = null;
    try {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      const parsed = parse_http(await file.text());
      if (parsed.requests.length === 0) parsed.requests.push(empty_request());
      doc = parsed;
      saved_text = serialize_http(parsed);
      path = target;
      select(0);
      response = null;
      problem = null;
    } catch (reason) {
      load_error = error_message(reason);
    } finally {
      loading = false;
    }
  }

  const initial = untrack(() => initial_path);
  if (initial) void load(initial);

  async function discard_ok() {
    return !dirty || confirm_discard(win, name);
  }

  async function new_file() {
    if (!(await discard_ok())) return;
    doc = fresh();
    saved_text = serialize_http(doc);
    path = null;
    load_error = null;
    select(0);
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: HTTP_FILES, start_path: path ? parent_path(path) : undefined, title: "Open in API Client" });
    if (chosen) await load(chosen);
  }

  async function write(target: string): Promise<boolean> {
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const text = serialize_http(doc);
      await files.create_file(directory, base_name(target), { content: text, overwrite: true });
      saved_text = text;
      path = target;
      return true;
    } catch (reason) {
      report("Couldn't save the requests", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const target = await win.pick_save({
      name: path ? name : "requests.http",
      accept: HTTP_FILES,
      start_path: path && !is_system_path(path) ? parent_path(path) : "/home",
    });
    return target ? write(target) : false;
  }

  function save(): Promise<boolean> {
    return path && !is_system_path(path) ? write(path) : save_as();
  }

  function prepared(): Prepared | null {
    try {
      problem = null;
      return prepare(current, doc.variables);
    } catch (reason) {
      problem = { title: error_message(reason), detail: "" };
      panel = Panel.RESPONSE;
      return null;
    }
  }

  async function send_request() {
    const request = prepared();
    if (!request) return;
    controller?.abort();
    const own = new AbortController();
    controller = own;
    sent_to = request.url;
    panel = Panel.RESPONSE;
    try {
      response = await send(request, own.signal);
    } catch (reason) {
      if (own.signal.aborted) return;
      response = null;
      problem = explain_fetch_error(reason, request.url, { online: navigator.onLine, protocol: location.protocol });
    } finally {
      if (controller === own) controller = null;
    }
  }

  function cancel() {
    controller?.abort();
    controller = null;
  }

  async function download_request() {
    const request = prepared();
    if (!request) return;
    try {
      void download(APP_ID, request, { folder: await downloads_folder() });
    } catch (reason) {
      report("Couldn't start the download", reason);
    }
  }

  async function save_body() {
    if (!response) return;
    const target = await win.pick_save({
      name: download_name(response.url, header_value(response.headers, "content-disposition") ?? null, response.content_type),
      start_path: "/home/Downloads",
    });
    if (!target) return;
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      await files.create_file(directory, base_name(target), { content: response.blob, overwrite: true });
    } catch (reason) {
      report("Couldn't save the body", reason);
    }
  }

  function format_body() {
    const formatted = pretty_json(current.body);
    if (formatted !== null) update({ body: formatted });
  }

  $effect(() => () => controller?.abort());
  $effect(() => win.set_title(name));
  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (panel !== Panel.RESPONSE) return false;
      panel = Panel.REQUEST;
      return true;
    })
  );

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `api-client.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("send", "mod+enter", "Send request", () => void send_request()),
      scoped("save", "mod+s", "Save", () => void save()),
      scoped("save-as", "mod+shift+s", "Save as…", () => void save_as()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    <IconButton size="sm" label="New" onclick={new_file}><FilePlusIcon /></IconButton>
    <IconButton size="sm" label="Open…" onclick={open}><FolderOpenIcon /></IconButton>
    <IconButton size="sm" label="Save" onclick={save}><FloppyDiskIcon /></IconButton>
    <IconButton size="sm" label="Save as…" onclick={save_as}><FloppyDiskBackIcon /></IconButton>
    <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/65" title={path ?? "Not saved yet"}>
      {name}{dirty ? " •" : ""}
    </span>
    <Select
      size="sm"
      aria-label="Request"
      class="w-auto max-w-48 @3xl:hidden"
      options={request_options}
      bind:value={() => String(selected), (value) => select(Number(value))}
    />
    <IconButton size="sm" label="Add request" class="@3xl:hidden" onclick={add_request}><PlusIcon /></IconButton>
    <IconButton size="sm" label="Delete request" class="@3xl:hidden" onclick={remove_request}><TrashIcon /></IconButton>
  </Toolbar>

  {#if loading}
    <div class="grid flex-1 place-items-center"><Spinner label="Opening" /></div>
  {:else if load_error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't open the file" description={load_error}>
      {#snippet actions()}
        <Button size="sm" onclick={open}>Open a file…</Button>
        <Button size="sm" variant="quiet" onclick={new_file}>New</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 flex-1 @3xl:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Requests" class="hidden min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-foreground/8 bg-background-light p-2 @3xl:flex">
        {#each doc.requests as request, index (index)}
          <button
            type="button"
            class={cn(
              "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui transition-colors duration-150",
              index === selected ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-foreground/8 hover:text-foreground"
            )}
            aria-current={index === selected}
            onclick={() => select(index)}
          >
            <span class="w-12 shrink-0 font-mono text-2xs font-semibold">{request.method}</span>
            <span class="truncate">{request_label(request, index)}</span>
          </button>
        {/each}
        <div class="mt-1 flex gap-1">
          <Button size="sm" variant="quiet" class="flex-1" onclick={add_request}><PlusIcon />Add request</Button>
          <IconButton size="sm" label="Delete request" onclick={remove_request}><TrashIcon /></IconButton>
        </div>
      </nav>

      <div class="flex min-h-0 min-w-0 flex-col">
        <Segmented
          size="sm"
          label="Panel"
          options={[
            { value: Panel.REQUEST, label: "Request" },
            { value: Panel.RESPONSE, label: "Response" },
          ]}
          bind:value={panel}
          class="mx-3 mt-3 shrink-0 *:flex-1 @6xl:hidden"
        />
        <div class="grid min-h-0 flex-1 @6xl:grid-cols-2">
          <section
            aria-label="Request"
            class={cn("min-h-0 flex-col gap-3 overflow-y-auto p-3 @6xl:flex @6xl:border-r @6xl:border-foreground/8", panel === Panel.REQUEST ? "flex" : "hidden")}
          >
            <Input size="sm" aria-label="Request name" placeholder="Untitled request" value={current.name} oninput={(event) => update({ name: event.currentTarget.value })} />
            <div class="flex flex-wrap gap-1.5">
              <Select size="sm" aria-label="Method" class="w-28 font-mono" options={method_options} bind:value={() => current.method, (method) => update({ method })} />
              <Input
                size="sm"
                class="min-w-48 flex-1 font-mono"
                aria-label="URL"
                placeholder="https://api.example.com/items"
                spellcheck="false"
                autocapitalize="off"
                inputmode="url"
                value={current.url}
                oninput={(event) => update({ url: event.currentTarget.value })}
                onkeydown={(event) => event.key === "Enter" && void send_request()}
              />
              <div class="flex gap-1.5">
                {#if controller}
                  <Button size="sm" onclick={cancel}>Cancel</Button>
                {:else}
                  <Button size="sm" variant="primary" onclick={send_request}><PaperPlaneTiltIcon />Send</Button>
                {/if}
                <IconButton size="sm" variant="secondary" label="Download to Downloads" onclick={download_request}><DownloadSimpleIcon /></IconButton>
              </div>
            </div>

            <Segmented size="sm" label="Request part" options={tabs} bind:value={tab} class="max-w-full self-start overflow-x-auto" />

            {#if tab === Tab.PARAMS}
              <PairsEditor label="Param" pairs={params} onchange={(pairs: Pair[]) => update({ url: with_query(current.url, pairs) })} />
            {:else if tab === Tab.HEADERS}
              <PairsEditor label="Header" name_placeholder="Accept" value_placeholder="application/json" pairs={current.headers} onchange={(headers: Pair[]) => update({ headers })} />
            {:else if tab === Tab.VARIABLES}
              <p class="text-ui text-foreground/65">Shared by every request in this file: write <span class="font-mono">{"{{name}}"}</span> in the URL, headers or body.</p>
              <PairsEditor label="Variable" name_placeholder="host" value_placeholder="https://api.example.com" pairs={doc.variables} onchange={(variables: Pair[]) => (doc.variables = variables)} />
            {:else}
              <div class="flex flex-wrap items-center gap-1.5">
                <Segmented
                  size="sm"
                  label="Body type"
                  options={[
                    { value: BodyKind.NONE, label: "None" },
                    { value: BodyKind.JSON, label: "JSON" },
                    { value: BodyKind.TEXT, label: "Text" },
                    { value: BodyKind.FORM, label: "Form" },
                  ]}
                  bind:value={() => kind, set_kind}
                />
                {#if kind === BodyKind.JSON}
                  <Button size="sm" variant="quiet" disabled={pretty_json(current.body) === null} onclick={format_body}>Format</Button>
                {/if}
              </div>
              {#if kind === BodyKind.FORM}
                <PairsEditor label="Field" pairs={parse_pairs(current.body)} onchange={(pairs: Pair[]) => update({ body: format_pairs(pairs) })} />
              {:else if kind === BodyKind.NONE}
                <p class="text-ui text-foreground/65">This request sends no body.</p>
              {:else}
                {#key selected}
                  <CodeView
                    value={current.body}
                    label="Request body"
                    language={kind === BodyKind.JSON ? Language.JSON : null}
                    onchange={(body) => update({ body })}
                    class="min-h-48 flex-1"
                  />
                {/key}
              {/if}
            {/if}
          </section>

          <section aria-label="Response" class={cn("min-h-0 flex-col gap-3 overflow-y-auto p-3 @6xl:flex", panel === Panel.RESPONSE ? "flex" : "hidden")}>
            {#if controller}
              <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Spinner label="Sending" />
                <p class="max-w-full truncate font-mono text-2xs text-foreground/65">{sent_to}</p>
                <Button size="sm" onclick={cancel}>Cancel</Button>
              </div>
            {:else if problem}
              <div role="alert" class="flex flex-col gap-1 rounded-md bg-error/12 px-3 py-2 text-ui text-error">
                <p class="font-medium">{problem.title}</p>
                {#if problem.detail}<p class="text-foreground/80">{problem.detail}</p>{/if}
              </div>
            {:else if response}
              <ResponseView {response} onsave={save_body} />
            {:else}
              <EmptyState icon={PaperPlaneTiltIcon} title="No response yet" description="Send the request to see its status, headers and body." />
            {/if}
          </section>
        </div>
      </div>
    </div>
  {/if}
</div>
