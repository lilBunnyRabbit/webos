<script lang="ts">
  import kernel, { Platform, type DialogsService, type FilesService } from "$lib/core/api";
  import { IconButton, Input, Segmented } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowLeft as ArrowLeftIcon,
    Camera as CameraIcon,
    Devices as DevicesIcon,
    FolderOpen as FolderOpenIcon,
    ImageSquare as ImageSquareIcon,
    Scribble as ScribbleIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { pick_photo } from "./image";
  import { filled_count, PROPOSAL_STATUSES, SECTION_IDS, SECTIONS, set_section, STATUS_LABELS, type Proposal, type SectionId } from "./model";
  import SectionEditor from "./section-editor.svelte";

  interface Props {
    proposal: Proposal;
    onchange: (change: (proposal: Proposal) => Proposal) => void;
    ondelete: () => void;
    onback: () => void;
    onsketch: (insert: (image: string) => void) => void;
    onerror: (title: string, reason: unknown) => void;
    /** Just created: the title takes focus, so typing names it. */
    fresh?: boolean;
  }

  let { proposal, onchange, ondelete, onback, onsketch, onerror, fresh = false }: Props = $props();

  let title_input = $state<HTMLInputElement | null>(null);

  onMount(() => {
    if (untrack(() => fresh)) title_input?.focus();
  });

  const { window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const mobile = kernel.platform === Platform.MOBILE;
  const uid = $props.id();

  const editors: Partial<Record<SectionId, SectionEditor>> = $state({});
  const filled = $derived(filled_count(proposal));
  const statuses = PROPOSAL_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));

  function anchor_of(event: MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function picture_menu(event: MouseEvent, id: SectionId) {
    const choice = await dialogs.menu(
      [
        ...(mobile ? [{ id: "camera", label: "Take a photo", icon: CameraIcon }] : []),
        { id: "device", label: mobile ? "Choose a picture" : "From this device…", icon: DevicesIcon },
        { id: "files", label: "From files…", icon: FolderOpenIcon },
        { id: "sketch", label: "Sketch…", icon: ScribbleIcon },
      ],
      { anchor: anchor_of(event) }
    );
    const editor = editors[id];
    if (!choice || !editor) return;
    try {
      if (choice === "sketch") return onsketch((image) => editors[id]?.insert(image));
      let pictures: Blob[] = [];
      if (choice === "camera") pictures = [await pick_photo(true)].filter((file) => file !== null);
      else if (choice === "device") pictures = await pick_device_files({ accept: ["image/*"], multiple: true });
      else if (choice === "files") {
        const paths = await win.pick_file({ accept: ["image/*"], multiple: true, title: "Add pictures" });
        const files = kernel.service<FilesService>("files");
        for (const path of paths) {
          const file = await files.get_file(path);
          if (file) pictures.push(file);
        }
      }
      if (pictures.length) await editor.insert_pictures(pictures);
    } catch (reason) {
      onerror("Couldn't add the picture", reason);
    }
  }
</script>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 @md:px-6" aria-label={proposal.title || "Untitled proposal"}>
  <header class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <IconButton label="All proposals" size="sm" class="back shrink-0" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
      <Input
        size="lg"
        class="min-w-0 flex-1 text-base font-medium"
        bind:element={title_input}
        placeholder="Name the idea"
        aria-label="Proposal title"
        value={proposal.title}
        oninput={(event) => {
          const title = event.currentTarget.value;
          onchange((value) => ({ ...value, title }));
        }}
      />
      <IconButton label="Delete proposal" size="sm" class="shrink-0" onclick={ondelete}><TrashIcon weight="bold" /></IconButton>
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Segmented
        size="sm"
        label="Status"
        options={statuses}
        bind:value={() => proposal.status, (status) => onchange((value) => ({ ...value, status }))}
      />
      <span class="flex items-center gap-2 text-2xs text-foreground/65" title="{filled} of {SECTION_IDS.length} sections filled">
        <span class="flex w-20 gap-0.5" aria-hidden="true">
          {#each SECTION_IDS as id, index (id)}
            <span class={["h-1 flex-1 rounded-full", index < filled ? "bg-primary" : "bg-foreground/12"]}></span>
          {/each}
        </span>
        <span class="font-mono tabular-nums">{filled}/{SECTION_IDS.length}</span>
      </span>
    </div>
  </header>

  {#each SECTION_IDS as id (id)}
    <section class="flex flex-col gap-1.5" aria-labelledby="{uid}-{id}-label">
      <div class="flex items-center gap-2">
        <h3 id="{uid}-{id}-label" class="flex-1 text-ui font-medium">{SECTIONS[id].label}</h3>
        <IconButton label="Add a picture to {SECTIONS[id].label}" size="sm" class="shrink-0" onclick={(event) => picture_menu(event, id)}>
          <ImageSquareIcon weight="bold" />
        </IconButton>
      </div>
      <SectionEditor
        bind:this={editors[id]}
        id="{uid}-{id}"
        label={SECTIONS[id].label}
        question={SECTIONS[id].question}
        content={proposal.sections[id]}
        onchange={(content) => onchange((value) => set_section(value, id, content))}
        onerror={(reason) => onerror("Couldn't add the picture", reason)}
      />
    </section>
  {/each}

  <p class="text-2xs text-foreground/65">Tap a picture to switch it between in the text and full width.</p>
</article>
