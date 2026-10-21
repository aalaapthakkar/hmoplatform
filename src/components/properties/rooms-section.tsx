"use client";

import { Mail, Phone, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addRoom,
  archiveRoom,
  type ActionResult,
  updateRoom,
} from "@/app/(app)/properties/[propertyId]/actions";
import {
  Field,
  FormIdPrefix,
  PoundsInput,
  selectClass,
  useFormValues,
} from "@/components/forms/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ROOM_STATUS_LABELS, type RoomSummary } from "@/lib/properties/rooms";
import { EDITABLE_ROOM_STATUSES, type RoomFormValues, roomSchema } from "@/lib/validation/room";

const FREQUENCY_OPTIONS = [
  ["monthly", "Per month"],
  ["four_weekly", "Every 4 weeks"],
  ["fortnightly", "Per fortnight"],
  ["weekly", "Per week"],
] as const;

type Editing = { mode: "add" } | { mode: "edit"; room: RoomSummary } | null;

type RoomsSectionProps = {
  propertyId: string;
  rooms: RoomSummary[];
  archivedRooms: RoomSummary[];
  nextRoomName: string;
};

export function RoomsSection({
  propertyId,
  rooms,
  archivedRooms,
  nextRoomName,
}: RoomsSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [archiving, setArchiving] = useState<RoomSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const wide = useMediaQuery("(min-width: 768px)");

  function finish(result: ActionResult, close: () => void) {
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    close();
    router.refresh();
  }

  function confirmArchive() {
    const room = archiving;
    if (!room) return;
    startTransition(async () => {
      finish(await archiveRoom(propertyId, room.id), () => setArchiving(null));
    });
  }

  return (
    <section aria-labelledby="rooms-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="rooms-heading" className="text-xl font-semibold">
            Rooms
          </h2>
          <p className="text-sm text-muted-foreground">
            Rent, status and who&apos;s living in each room.
          </p>
        </div>
        <Button size="lg" onClick={() => setEditing({ mode: "add" })}>
          <Plus aria-hidden />
          Add room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No rooms yet. Add the first one to start letting.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onEdit={() => setEditing({ mode: "edit", room })}
              onArchive={() => setArchiving(room)}
            />
          ))}
        </div>
      )}

      {archivedRooms.length > 0 ? (
        <details className="mt-6 rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Show archived rooms ({archivedRooms.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-1 text-muted-foreground">
            {archivedRooms.map((room) => (
              <li key={room.id}>
                {room.name} · {room.rent}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {editing ? (
            <RoomForm
              key={editing.mode === "edit" ? editing.room.id : "new"}
              title={editing.mode === "edit" ? `Edit ${editing.room.name}` : "Add a room"}
              submitLabel={editing.mode === "edit" ? "Save room" : "Add room"}
              initial={
                editing.mode === "edit"
                  ? editing.room.formValues
                  : {
                      name: nextRoomName,
                      rent: "",
                      rentFrequency: "monthly",
                      status: "available",
                      size: "",
                      features: "",
                    }
              }
              onSubmit={async (values) =>
                editing.mode === "edit"
                  ? updateRoom(propertyId, editing.room.id, values)
                  : addRoom(propertyId, values)
              }
              onDone={(result) => finish(result, () => setEditing(null))}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(open) => (open ? null : setArchiving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be offered or counted in occupancy. Its history is kept, but an
              archived room can&apos;t be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep room</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={confirmArchive}>
              {pending ? "Archiving…" : "Archive room"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RoomCard({
  room,
  onEdit,
  onArchive,
}: {
  room: RoomSummary;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const tenancy = room.currentTenancy;
  return (
    <Card data-testid="room-card">
      <CardHeader>
        <CardTitle>{room.name}</CardTitle>
        <CardDescription>{room.rent}</CardDescription>
        <CardAction>
          <Badge
            variant={
              room.status === "let"
                ? "default"
                : room.status === "available"
                  ? "secondary"
                  : "outline"
            }
          >
            {room.statusLabel}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tenancy ? (
          <div className="flex flex-col gap-1.5">
            {tenancy.tenants.map((tenant) => (
              <div key={tenant.name} className="flex flex-col gap-1">
                <p className="font-medium">{tenant.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {tenant.email ? (
                    <a
                      href={`mailto:${tenant.email}`}
                      className="flex min-h-6 items-center gap-1.5 break-all underline-offset-4 hover:underline"
                    >
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      {tenant.email}
                    </a>
                  ) : null}
                  {tenant.phone ? (
                    <a
                      href={`tel:${tenant.phone.replace(/\s+/g, "")}`}
                      className="flex min-h-6 items-center gap-1.5 underline-offset-4 hover:underline"
                    >
                      <Phone className="size-3.5 shrink-0" aria-hidden />
                      {tenant.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground">Moved in {tenancy.moveIn}</p>
          </div>
        ) : (
          <p className="text-muted-foreground">No current tenant</p>
        )}
        {room.size || room.features.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {[room.size ? `${room.size} m²` : null, ...room.features].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" onClick={onEdit} aria-label={`Edit ${room.name}`}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onArchive} aria-label={`Archive ${room.name}`}>
          Archive
        </Button>
      </CardFooter>
    </Card>
  );
}

function RoomForm({
  title,
  submitLabel,
  initial,
  onSubmit,
  onDone,
}: {
  title: string;
  submitLabel: string;
  initial: RoomFormValues;
  onSubmit: (values: RoomFormValues) => Promise<ActionResult>;
  onDone: (result: ActionResult) => void;
}) {
  const form = useFormValues(initial);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(roomSchema)) return;
    startTransition(async () => onDone(await onSubmit(form.values)));
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Rent is what one tenant pays for this room.</SheetDescription>
        </SheetHeader>

        <Field name="name" label="Name" error={form.errors.name}>
          <Input {...form.field("name")} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field name="rent" label="Rent (optional)" error={form.errors.rent}>
            <PoundsInput {...form.field("rent")} />
          </Field>
          <Field name="rentFrequency" label="How often" error={form.errors.rentFrequency}>
            <select {...form.field("rentFrequency")} className={selectClass}>
              {FREQUENCY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field name="status" label="Status" error={form.errors.status}>
          <select {...form.field("status")} className={selectClass}>
            {EDITABLE_ROOM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ROOM_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="size" label="Size in m² (optional)" error={form.errors.size}>
          <Input
            {...form.field("size")}
            inputMode="decimal"
            autoComplete="off"
            className="max-w-28"
          />
        </Field>
        <Field
          name="features"
          label="Features (optional)"
          hint="Separate with commas, like double bed, en suite, desk."
          error={form.errors.features}
        >
          <Input {...form.field("features")} autoComplete="off" />
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </FormIdPrefix>
  );
}
