# @ethanhann/mantine-detail

[![npm version](https://img.shields.io/npm/v/@ethanhann/mantine-detail.svg)](https://www.npmjs.com/package/@ethanhann/mantine-detail)
[![CI](https://github.com/ethanhann/mantine-detail/actions/workflows/ci.yml/badge.svg)](https://github.com/ethanhann/mantine-detail/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fethanhann.github.io%2Fmantine-detail%2Fcoverage-badge.json)](https://ethanhann.github.io/mantine-detail)
[![Storybook](https://img.shields.io/badge/Storybook-deployed-ff4785?logo=storybook&logoColor=white)](https://ethanhann.github.io/mantine-detail)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The single-record companion to [`@ethanhann/mantine-dataview`](https://www.npmjs.com/package/@ethanhann/mantine-dataview).
Where dataview is the **many** (a read-only list), `mantine-detail` is the **one**: a record's
`view` / `edit` / `create` lifecycle, presented in a pluggable surface (drawer / modal / panel /
inline) and reconciled back into a master list.

It owns the reusable part of "editing a record in a dashboard": the **lifecycle and the binding**.
You bring your own **form layer** (`@mantine/form` / React Hook Form) and your own **fields**; the
library never owns them. Built on [Mantine](https://mantine.dev) v9.

## Install

```sh
npm install @ethanhann/mantine-detail
```

**Peer dependencies** (required): `react`, `react-dom`, `@mantine/core`, `@mantine/hooks`,
`@mantine/modals`. Wrap your app in `MantineProvider` and `ModalsProvider` (the latter powers the
dirty-guard confirm modal).

**Optional peers**, needed only when you import the matching subpath:
`@ethanhann/mantine-dataview` (`/dataview`), `@mantine/form` (`/mantine-form`), `react-hook-form`
(`/react-hook-form`).

Import the styles once:

```ts
import "@ethanhann/mantine-detail/styles.css";
```

## Subpath exports

| Import | Provides |
|--------|----------|
| `@ethanhann/mantine-detail` | `useDetail`, `useDetailFetcher`, `<Detail>` + parts, presentations, `useDirtyGuard`, types |
| `@ethanhann/mantine-detail/styles.css` | Component styles |
| `@ethanhann/mantine-detail/dataview` | `bindDataView` (pulls dataview as a peer here only) |
| `@ethanhann/mantine-detail/mantine-form` | `useMantineFormDetail` (peer here only) |
| `@ethanhann/mantine-detail/react-hook-form` | `useReactHookFormDetail` (peer here only) |

## Quick start

The recommended path is `useDetailFetcher` (you provide `load` / `submit` / `remove`) plus the
`<Detail>` surface. Bring your own form. Here the `@mantine/form` adapter auto-wires
`isDirty`, reset-on-load, and a validating `onSave`.

```tsx
import { useForm } from "@mantine/form";
import { Select, Stack, TextInput } from "@mantine/core";
import { Detail, useDetailFetcher, useDirtyGuard } from "@ethanhann/mantine-detail";
import { useMantineFormDetail } from "@ethanhann/mantine-detail/mantine-form";

interface User { id: string; name: string; email: string }

export function UserDetail() {
  const detail = useDetailFetcher<User>({
    getRowId: (u) => u.id,
    load: (id) => api.getUser(id),
    submit: (values, ctx) => api.saveUser(values, ctx), // ctx: { mode, id? }
    remove: (id) => api.deleteUser(id),
  });

  const form = useForm<User>({ mode: "controlled", initialValues: { id: "", name: "", email: "" } });
  const bind = useMantineFormDetail(detail, form);
  const guard = useDirtyGuard({ when: bind.isDirty });

  return (
    <>
      <button type="button" onClick={() => detail.open("42")}>Open</button>
      <button type="button" onClick={() => detail.openCreate()}>New</button>

      <Detail
        detail={detail}
        presentation="drawer"
        isDirty={bind.isDirty}
        confirmDiscard={guard.confirmDiscard}
        title="User"
      >
        <Detail.Header />
        <Detail.Body>
          {detail.mode === "view"
            ? <ReadView record={detail.record} />
            : (
              <Stack>
                <TextInput label="Name" {...form.getInputProps("name")} />
                <TextInput label="Email" {...form.getInputProps("email")} />
              </Stack>
            )}
        </Detail.Body>
        <Detail.Actions onSave={bind.onSave} deletable />
      </Detail>
    </>
  );
}
```

Without an adapter the core stays form-agnostic. The bare `<Detail.Actions>` just needs an
`onSave` that hands your values to `detail.save`:

```tsx
<Detail.Actions onSave={() => detail.save(form.getValues())} />
```

`open` takes an optional mode, so you can jump straight into editing: `detail.open("42", "edit")`.
`useDetailFetcher` also accepts `initialMode` and a `reconcile` strategy hint (see below).

## Controlled core (`useDetail`)

`useDetailFetcher` is a thin wrapper over `useDetail`, the headless controlled core. Reach for
`useDetail` directly when the async load/submit state lives elsewhere (React Query, Redux, RSC):
you feed `record` / `status` / `error` and respond to `onLoadRequest`, and you call
`onSubmit` / `onDelete` yourself. The core owns *when* writes run and *what happens after*
(reconcile, return to view, close). It never owns the field state or the fetch.

```tsx
import { useDetail } from "@ethanhann/mantine-detail";

// load state owned by your data layer (React Query shown, illustrative):
const query = useQuery({ queryKey: ["user", id], queryFn: () => api.getUser(id), enabled: !!id });

const detail = useDetail<User>({
  getRowId: (u) => u.id,
  record: query.data ?? null,
  status: query.isLoading ? "loading" : query.isError ? "error" : query.data ? "success" : "idle",
  error: query.error,
  onLoadRequest: (id) => setId(id),                 // you drive the fetch
  onSubmit: (values, ctx) => api.saveUser(values, ctx),
  onDelete: (id) => api.deleteUser(id),
});
```

`<Detail>`, the dirty guard, presentations, and the master binding all work identically. The
return shape is the same `UseDetailReturn`.

## Presentations

`presentation`: `"drawer" | "modal" | "panel" | "inline"`. Drawer/modal open from `detail.isOpen`;
panel and inline are embedded (you control visibility, rendering them when `detail.isOpen` or always
on a detail route). Each is also exported standalone (`<DetailDrawer>`, `<DetailModal>`,
`<DetailPanel>`) for full layout control. **Route** is not a separate mode: render
`presentation="inline"` on your detail route; the library adds no routing.

## The view ↔ edit toggle

`view` is included as **orchestration only**. The library has no field schema, so *you* render both
the read view and the form, branching on `detail.mode`. The library owns the transition and its
guard: the Header's **Edit** enters edit, Actions' **Cancel** reverts to view (or closes a create),
and everything routes through the dirty guard.

## States & slots

`<Detail.Body>` reflects the **load** lifecycle automatically in `view` and `edit`, and never in
`create`. While `status === "loading"` it renders a skeleton. On `status === "error"` it renders an
error message with a **Retry** that re-emits `load()`. Your fields render once the record is loaded.
Submit and delete failures are separate. They surface on `submitError` rather than `status`, and you
retry them by calling `save` or `remove` again. Actions disable themselves while loading,
submitting, or deleting.

Override any standard part with the `slots` prop. `Header` / `Actions` receive `{ detail }`,
`ErrorState` receives `{ retry }`, and `LoadingDetail` takes no props:

```tsx
<Detail
  detail={detail}
  slots={{
    LoadingDetail: () => <MySkeleton />,
    ErrorState: ({ retry }) => <MyError onRetry={retry} />,
    Header: ({ detail }) => <MyHeader mode={detail.mode} />,
    Actions: ({ detail }) => <MyActions detail={detail} />,
  }}
>
  <Detail.Header />
  <Detail.Body>{/* your fields */}</Detail.Body>
  <Detail.Actions onSave={bind.onSave} />
</Detail>
```

## Dirty guard

`useDirtyGuard` renders a Mantine confirm modal and exposes `confirmDiscard()`, so the same prompt
guards both in-app close/cancel and external router navigation:

```tsx
const guard = useDirtyGuard({ when: bind.isDirty, message: "Discard unsaved changes?" });

// In-app close/cancel: feed confirmDiscard to <Detail> alongside the isDirty prop
// (as in Quick start), or to the hook via its confirmDiscard option.

// Router navigation is the consumer's job; confirmDiscard() is router-agnostic.
// React Router v6.4+ (illustrative):
const blocker = useBlocker(bind.isDirty);
useEffect(() => {
  if (blocker.state === "blocked") {
    guard.confirmDiscard().then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }
}, [blocker, guard]);
```

`confirmDiscard()` resolves `true` immediately (no prompt) when there's nothing to discard.

**Where `isDirty` comes from.** When the form lives inside `<Detail>` (the common case), pass the
live signal as `<Detail isDirty={...}>`. That prop overrides the hook's `isDirty` option and is what
the guard and Actions read. Use the hook's `isDirty` option only when dirtiness is known where the
hook is created. Supply `confirmDiscard` on whichever path you use.

## Binding to a master list

Saves/creates/deletes reconcile back into a master list through a small `MasterBinding` adapter.
For dataview, `bindDataView` reconciles via the list's existing `refetch()`, so dataview needs no
new API and stays read-only.

```tsx
import { bindDataView } from "@ethanhann/mantine-detail/dataview";

const detail = useDetailFetcher<User>({
  getRowId, load, submit, remove,
  master: bindDataView(view), // view = the useDataViewFetcher return
});
```

`bindDataView` owns `activeId` (the open record, for row highlight) independently of dataview's
checkbox `selection` used for bulk actions.

### Any list (custom `MasterBinding`)

`bindDataView` is one implementation; the seam is the exported `MasterBinding` interface, so you can
bind any list. Implement three members and saves, creates, and deletes flow into it. `reconcile`
should `switch` exhaustively over the event union:

```tsx
import type { MasterBinding, ReconcileEvent } from "@ethanhann/mantine-detail";

function bindMyList(list: MyList): MasterBinding<User> {
  return {
    activeId: list.activeId,
    setActive: (id) => list.setActive(id),
    reconcile: (event: ReconcileEvent<User>) => {
      switch (event.type) {
        case "saved":   list.upsert(event.record); break;
        case "created": list.upsert(event.record); break;
        case "deleted": list.remove(event.id); break;
      }
    },
  };
}
```

### Reconciliation strategy

`bindDataView` accepts a `strategy`:

| Strategy | Behavior |
| --- | --- |
| `"refetch"` *(default)* | Re-emit the list's request after every write. Always matches server truth (filter membership, sort, page, facet counts); one round-trip per write. |
| `"patch"` | Apply the change in place for instant feedback, then let dataview revalidate in the background. Requires `@ethanhann/mantine-dataview` ≥ 0.8. |

```tsx
const master = bindDataView(view, { strategy: "patch" });

// view.isRevalidating is true while dataview reconciles with the server after an
// optimistic write. Use it for a subtle sync indicator, not a loading skeleton.
{view.isRevalidating && <Loader size="xs" />}
```

Under `"patch"`, a `saved`/`created`/`deleted` maps onto dataview's
`patchRow`/`insertRow`/`removeRow`: the row updates immediately, then a debounced background fetch
reconciles sort position, filter membership, pagination, and facet counts. The optimistic view is a
best-effort preview. **The background fetch is the source of truth.** An edited row that no longer
matches the active filter disappears when the server responds, and an off-page create is
repositioned. Stick with the default `"refetch"` when instant feedback isn't worth the added
moving parts.

## The `<MasterDetail>` recipe (not a component)

A side-by-side layout is shipped as a recipe, not code. Bundling it would recouple this library to
dataview. See the Storybook story for the full version; the gist:

```tsx
function UsersScreen() {
  const view = useDataViewFetcher<User>({ columns, getRowId, fetcher });
  const master = bindDataView(view);
  const detail = useDetailFetcher<User>({ getRowId, load, submit, remove, master });

  return (
    <Grid>
      <Grid.Col span={detail.isOpen ? 7 : 12}>
        <DataViewer
          view={view}
          slots={{ Row: ({ row, cells }) => (
            <Table.Tr style={{ cursor: "pointer" }} onClick={() => detail.open(row.original.id)}>
              {cells}
            </Table.Tr>
          ) }}
        />
      </Grid.Col>
      {detail.isOpen && (
        <Grid.Col span={5}>
          <UserDetail detail={detail} /> {/* presentation="panel" */}
        </Grid.Col>
      )}
    </Grid>
  );
}
```

Drawer and modal variants are the same wiring with a different `presentation`. Add a create flow
with a `<button onClick={() => detail.openCreate()}>New</button>` beside the list, and saving
reconciles the new row in through the binding. For instant in-place updates, bind with
`bindDataView(view, { strategy: "patch" })` (see [Reconciliation strategy](#reconciliation-strategy))
and optionally surface `view.isRevalidating` as a sync indicator. The three variants are
side-by-side, drawer, and optimistic patch, and all are in the Storybook `MasterDetail recipe`
stories.

## API

### Hooks

| Export | Summary |
|--------|---------|
| `useDetailFetcher(options)` | Recommended. Owns async `load`/`submit`/`remove`, orchestrates the lifecycle. |
| `useDetail(options)` | Headless controlled core. You supply `record`/`status` and respond to `onLoadRequest`. |
| `useDirtyGuard({ when, message?, title?, labels? })` | Confirm-modal guard; returns `{ isDirty, confirmDiscard }`. |
| `bindDataView(view, { strategy? })` *(`/dataview`)* | `MasterBinding` over a dataview instance; `strategy` is `"refetch"` (default) or `"patch"`. |
| `useMantineFormDetail(detail, form, opts?)` *(`/mantine-form`)* | Adapter → `{ isDirty, onSave }`. |
| `useReactHookFormDetail(detail, form, opts?)` *(`/react-hook-form`)* | Adapter → `{ isDirty, onSave }`. |

`useDetailFetcher` / `useDetail` return: `mode`, `record`, `status` (load-scoped), `error`,
`isSubmitting`, `isDeleting`, `submitError`, `isOpen`, `isDirty`, and the actions `open`,
`openCreate`, `setMode`, `close`, `save`, `remove`, `retry`.

### Components

`<Detail>` (+ `<Detail.Header>` / `<Detail.Body>` / `<Detail.Actions>`), and the standalone
`<DetailDrawer>` / `<DetailModal>` / `<DetailPanel>`. Slots: `Header`, `Actions`, `LoadingDetail`,
`ErrorState`.

## Form adapters

Both adapters auto-reset the form to each loaded record (and to a blank form on create), surface
`isDirty`, and give a validating `onSave`. Pass `{ toForm }` when your form values differ from the
record shape. The `@mantine/form` adapter expects a **controlled** form (`useForm({ mode:
"controlled" })`) so `isDirty` stays reactive. The core never depends on a form library. The
adapters operate on the form instance you pass in.

## Development

```sh
npm install
npm run dev          # Storybook
npm run test         # Vitest (watch)
npm run typecheck    # tsc --noEmit
npm run lint         # Biome
npm run build        # Vite library build
```

## License

MIT
