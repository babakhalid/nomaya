import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Select,
  SkeletonRows,
  Textarea,
  cx,
} from "../components/ui";
import { eur } from "../lib/format";

const TABS = ["Team", "Rooms", "Activities", "Services", "Packages"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Team");
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-faint">
          The house setup — team, inventory and what you sell.
        </p>
      </header>

      <div className="mb-8 flex gap-1 overflow-x-auto border-b border-sand-200">
        {TABS.filter((t) => t !== "Team" || isAdmin).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
              tab === t
                ? "border-ocean-600 text-ocean-700"
                : "border-transparent text-ink-faint hover:text-ink",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Team" && isAdmin && <TeamTab meId={me?._id} />}
      {tab === "Rooms" && <RoomsTab />}
      {tab === "Activities" && <ActivitiesTab />}
      {tab === "Services" && <ServicesTab />}
      {tab === "Packages" && <PackagesTab />}
    </div>
  );
}

// ── Team ───────────────────────────────────────────────────────────────

function TeamTab({ meId }: { meId?: Id<"users"> }) {
  const users = useQuery(api.users.list);
  const setRole = useMutation(api.users.setRole);
  const setActive = useMutation(api.users.setActive);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-faint">
        New crew members create their own account on the sign-in page — promote them here.
      </p>
      <div className="overflow-hidden rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {users === undefined ? (
          <div className="p-4"><SkeletonRows count={3} /></div>
        ) : (
          <ul className="divide-y divide-sand-100">
            {users.map((user) => (
              <li key={user._id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ocean-100 text-xs font-bold text-ocean-800">
                  {(user.name ?? user.email ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {user.name ?? "—"}
                    {user._id === meId && <span className="ml-2 text-xs font-normal text-ink-faint">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-faint">{user.email}</p>
                </div>
                {user.active === false && <Badge tone="red">Deactivated</Badge>}
                <Select
                  value={user.role ?? "crew"}
                  disabled={user._id === meId}
                  onChange={(e) =>
                    void setRole({ userId: user._id, role: e.target.value as "admin" | "manager" | "crew" })
                  }
                  className="w-32"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="crew">Crew</option>
                </Select>
                {user._id !== meId && (
                  <Button
                    size="sm"
                    variant={user.active === false ? "secondary" : "danger"}
                    onClick={() => void setActive({ userId: user._id, active: user.active === false })}
                  >
                    {user.active === false ? "Reactivate" : "Deactivate"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Rooms ──────────────────────────────────────────────────────────────

function RoomsTab() {
  const rooms = useQuery(api.inventory.listRooms);
  const roomTypes = useQuery(api.inventory.listRoomTypes);
  const beds = useQuery(api.inventory.listBeds);
  const upsertRoom = useMutation(api.inventory.upsertRoom);
  const upsertRoomType = useMutation(api.inventory.upsertRoomType);
  const [editing, setEditing] = useState<"new-room" | "new-type" | Id<"rooms"> | null>(null);

  const editingRoom = rooms?.find((r) => r._id === editing);

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing("new-type")}>
          <Plus size={14} weight="bold" /> Room type
        </Button>
        <Button size="sm" onClick={() => setEditing("new-room")}>
          <Plus size={14} weight="bold" /> Room
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {rooms === undefined || roomTypes === undefined ? (
          <div className="p-4"><SkeletonRows count={4} /></div>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rooms.map((room) => {
              const type = roomTypes.find((t) => t._id === room.roomTypeId);
              const bedCount = beds?.filter((b) => b.roomId === room._id).length ?? 0;
              return (
                <li key={room._id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{room.name}</p>
                    <p className="text-xs text-ink-faint">
                      {type?.name} · {type?.mode === "dorm" ? `${bedCount} beds` : `sleeps ${type?.capacity}`} ·{" "}
                      {eur(type?.basePrice ?? 0)}/night{type?.mode === "dorm" ? " per bed" : ""}
                    </p>
                  </div>
                  {room.status === "maintenance" && <Badge tone="red">Maintenance</Badge>}
                  <Button size="sm" variant="secondary" onClick={() => setEditing(room._id)}>
                    Edit
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Room type drawer */}
      <Drawer open={editing === "new-type"} onClose={() => setEditing(null)} title="New room type">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await upsertRoomType({
              name: String(form.get("name")),
              description: String(form.get("description")) || undefined,
              mode: form.get("mode") as "private" | "dorm",
              capacity: Number(form.get("capacity")),
              basePrice: Number(form.get("basePrice")),
            });
            setEditing(null);
          }}
        >
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Description"><Textarea name="description" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mode">
              <Select name="mode" defaultValue="private">
                <option value="private">Private</option>
                <option value="dorm">Dorm</option>
              </Select>
            </Field>
            <Field label="Capacity"><Input name="capacity" type="number" min={1} defaultValue={2} /></Field>
            <Field label="Price/night"><Input name="basePrice" type="number" min={0} step="0.01" required /></Field>
          </div>
          <Button type="submit">Create room type</Button>
        </form>
      </Drawer>

      {/* Room drawer */}
      <Drawer
        open={editing === "new-room" || !!editingRoom}
        onClose={() => setEditing(null)}
        title={editingRoom ? `Edit ${editingRoom.name}` : "New room"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await upsertRoom({
              id: editingRoom?._id,
              roomTypeId: form.get("roomTypeId") as Id<"roomTypes">,
              name: String(form.get("name")),
              floor: String(form.get("floor")) || undefined,
              status: form.get("status") as "available" | "maintenance",
              bedCount: form.get("bedCount") ? Number(form.get("bedCount")) : undefined,
            });
            setEditing(null);
          }}
        >
          <Field label="Name"><Input name="name" defaultValue={editingRoom?.name} required /></Field>
          <Field label="Room type">
            <Select name="roomTypeId" defaultValue={editingRoom?.roomTypeId} required>
              {roomTypes?.map((type) => (
                <option key={type._id} value={type._id}>
                  {type.name} ({type.mode})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Floor"><Input name="floor" defaultValue={editingRoom?.floor} /></Field>
            <Field label="Status">
              <Select name="status" defaultValue={editingRoom?.status ?? "available"}>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance</option>
              </Select>
            </Field>
            <Field label="Beds (dorms)" hint="Only used for dorm types">
              <Input
                name="bedCount"
                type="number"
                min={1}
                defaultValue={
                  editingRoom
                    ? beds?.filter((b) => b.roomId === editingRoom._id).length || ""
                    : ""
                }
              />
            </Field>
          </div>
          <Button type="submit">{editingRoom ? "Save changes" : "Create room"}</Button>
        </form>
      </Drawer>
    </div>
  );
}

// ── Activities ─────────────────────────────────────────────────────────

function ActivitiesTab() {
  const activities = useQuery(api.catalog.listActivities);
  const upsert = useMutation(api.catalog.upsertActivity);
  const [editing, setEditing] = useState<"new" | Id<"activities"> | null>(null);
  const editingItem = activities?.find((a) => a._id === editing);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} weight="bold" /> Activity
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {activities === undefined ? (
          <div className="p-4"><SkeletonRows count={3} /></div>
        ) : (
          <ul className="divide-y divide-sand-100">
            {activities.map((activity) => (
              <li key={activity._id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="h-3 w-3 rounded-full" style={{ background: activity.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {activity.name}
                    {activity.startTime && (
                      <span className="num ml-2 rounded-md bg-ocean-50 px-1.5 py-0.5 text-[11px] font-bold text-ocean-800">
                        {activity.startTime}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {eur(activity.price)} · {activity.durationMin} min · max {activity.capacityPerSession}/session
                  </p>
                </div>
                {!activity.active && <Badge>Inactive</Badge>}
                <Button size="sm" variant="secondary" onClick={() => setEditing(activity._id)}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingItem ? `Edit ${editingItem.name}` : "New activity"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await upsert({
              id: editingItem?._id,
              name: String(form.get("name")),
              type: form.get("type") as "surf_lesson" | "surf_guiding" | "yoga" | "excursion" | "other",
              capacityPerSession: Number(form.get("capacityPerSession")),
              price: Number(form.get("price")),
              durationMin: Number(form.get("durationMin")),
              color: String(form.get("color")),
              active: form.get("active") === "on",
              startTime: String(form.get("startTime")) || undefined,
            });
            setEditing(null);
          }}
        >
          <Field label="Name"><Input name="name" defaultValue={editingItem?.name} required /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type">
              <Select name="type" defaultValue={editingItem?.type ?? "surf_lesson"}>
                <option value="surf_lesson">Surf lesson</option>
                <option value="surf_guiding">Surf guiding</option>
                <option value="yoga">Yoga</option>
                <option value="excursion">Excursion</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Daily time">
              <Input name="startTime" type="time" defaultValue={editingItem?.startTime ?? ""} />
            </Field>
            <Field label="Color"><Input name="color" type="color" defaultValue={editingItem?.color ?? "#2b8188"} className="h-10 p-1" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price"><Input name="price" type="number" min={0} step="0.01" defaultValue={editingItem?.price} required /></Field>
            <Field label="Duration (min)"><Input name="durationMin" type="number" min={15} defaultValue={editingItem?.durationMin ?? 120} /></Field>
            <Field label="Capacity"><Input name="capacityPerSession" type="number" min={1} defaultValue={editingItem?.capacityPerSession ?? 8} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editingItem?.active ?? true} />
            Active (bookable)
          </label>
          <Button type="submit">{editingItem ? "Save" : "Create"}</Button>
        </form>
      </Drawer>
    </div>
  );
}

// ── Services ───────────────────────────────────────────────────────────

function ServicesTab() {
  const services = useQuery(api.catalog.listServices);
  const upsert = useMutation(api.catalog.upsertService);
  const [editing, setEditing] = useState<"new" | Id<"services"> | null>(null);
  const editingItem = services?.find((s) => s._id === editing);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} weight="bold" /> Service
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {services === undefined ? (
          <div className="p-4"><SkeletonRows count={3} /></div>
        ) : (
          <ul className="divide-y divide-sand-100">
            {services.map((service) => (
              <li key={service._id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {service.name}
                    {service.startTime && (
                      <span className="num ml-2 rounded-md bg-ocean-50 px-1.5 py-0.5 text-[11px] font-bold text-ocean-800">
                        {service.startTime}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {eur(service.price)} {service.unit.replace("_", " ")}
                  </p>
                </div>
                {!service.active && <Badge>Inactive</Badge>}
                <Button size="sm" variant="secondary" onClick={() => setEditing(service._id)}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingItem ? `Edit ${editingItem.name}` : "New service"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await upsert({
              id: editingItem?._id,
              name: String(form.get("name")),
              price: Number(form.get("price")),
              unit: form.get("unit") as "per_stay" | "per_day" | "per_unit",
              active: form.get("active") === "on",
              startTime: String(form.get("startTime")) || undefined,
            });
            setEditing(null);
          }}
        >
          <Field label="Name"><Input name="name" defaultValue={editingItem?.name} required /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price"><Input name="price" type="number" min={0} step="0.01" defaultValue={editingItem?.price} required /></Field>
            <Field label="Unit">
              <Select name="unit" defaultValue={editingItem?.unit ?? "per_unit"}>
                <option value="per_unit">Per unit</option>
                <option value="per_day">Per day</option>
                <option value="per_stay">Per stay</option>
              </Select>
            </Field>
            <Field label="Daily time">
              <Input name="startTime" type="time" defaultValue={editingItem?.startTime ?? ""} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editingItem?.active ?? true} />
            Active (bookable)
          </label>
          <Button type="submit">{editingItem ? "Save" : "Create"}</Button>
        </form>
      </Drawer>
    </div>
  );
}

// ── Packages ───────────────────────────────────────────────────────────

function PackagesTab() {
  const packages = useQuery(api.catalog.listPackages);
  const activities = useQuery(api.catalog.listActivities);
  const services = useQuery(api.catalog.listServices);
  const upsert = useMutation(api.catalog.upsertPackage);
  const [editing, setEditing] = useState<"new" | Id<"packages"> | null>(null);
  const [items, setItems] = useState<{ kind: "activity" | "service"; refId: string; qty: number }[]>([]);
  const editingItem = packages?.find((p) => p._id === editing);

  function openEditor(target: "new" | Id<"packages">) {
    const pkg = packages?.find((p) => p._id === target);
    setItems(pkg?.includedItems ?? []);
    setEditing(target);
  }

  const nameOf = (item: { kind: string; refId: string }) =>
    item.kind === "activity"
      ? (activities?.find((a) => a._id === item.refId)?.name ?? "?")
      : (services?.find((s) => s._id === item.refId)?.name ?? "?");

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => openEditor("new")}>
          <Plus size={14} weight="bold" /> Package
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {packages === undefined ? (
          <SkeletonRows count={2} />
        ) : (
          packages.map((pkg) => (
            <div key={pkg._id} className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{pkg.name}</p>
                  <p className="mt-0.5 text-sm text-ink-faint">{pkg.description}</p>
                </div>
                <p className="num shrink-0 text-lg font-bold text-ocean-700">{eur(pkg.price)}</p>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                <li className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium">
                  {pkg.nights} nights
                </li>
                {pkg.includedItems.map((item, i) => (
                  <li key={i} className="rounded-full bg-ocean-50 px-2.5 py-0.5 text-xs font-medium text-ocean-800">
                    {item.qty}× {nameOf(item)}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                {!pkg.active ? <Badge>Inactive</Badge> : <span />}
                <Button size="sm" variant="secondary" onClick={() => openEditor(pkg._id)}>Edit</Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingItem ? `Edit ${editingItem.name}` : "New package"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await upsert({
              id: editingItem?._id,
              name: String(form.get("name")),
              description: String(form.get("description")) || undefined,
              price: Number(form.get("price")),
              nights: Number(form.get("nights")),
              includedItems: items,
              active: form.get("active") === "on",
            });
            setEditing(null);
          }}
        >
          <Field label="Name"><Input name="name" defaultValue={editingItem?.name} required /></Field>
          <Field label="Description"><Textarea name="description" defaultValue={editingItem?.description} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price"><Input name="price" type="number" min={0} step="0.01" defaultValue={editingItem?.price} required /></Field>
            <Field label="Nights"><Input name="nights" type="number" min={1} defaultValue={editingItem?.nights ?? 7} /></Field>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">Included items</p>
            <ul className="mb-2 flex flex-col gap-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-sand-100 px-3 py-1.5 text-sm">
                  <span>{item.qty}× {nameOf(item)}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-coral cursor-pointer"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <AddItemRow
              activities={activities?.filter((a) => a.active) ?? []}
              services={services?.filter((s) => s.active) ?? []}
              onAdd={(item) => setItems([...items, item])}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editingItem?.active ?? true} />
            Active (bookable)
          </label>
          <Button type="submit">{editingItem ? "Save" : "Create"}</Button>
        </form>
      </Drawer>
    </div>
  );
}

function AddItemRow({
  activities,
  services,
  onAdd,
}: {
  activities: { _id: string; name: string }[];
  services: { _id: string; name: string }[];
  onAdd: (item: { kind: "activity" | "service"; refId: string; qty: number }) => void;
}) {
  const [value, setValue] = useState("");
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onChange={(e) => setValue(e.target.value)} className="flex-1">
        <option value="">Pick an item…</option>
        <optgroup label="Activities">
          {activities.map((a) => (
            <option key={a._id} value={`activity|${a._id}`}>{a.name}</option>
          ))}
        </optgroup>
        <optgroup label="Services">
          {services.map((s) => (
            <option key={s._id} value={`service|${s._id}`}>{s.name}</option>
          ))}
        </optgroup>
      </Select>
      <Input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        className="w-20"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!value}
        onClick={() => {
          const [kind, refId] = value.split("|");
          onAdd({ kind: kind as "activity" | "service", refId, qty });
          setValue("");
          setQty(1);
        }}
      >
        Add
      </Button>
    </div>
  );
}
