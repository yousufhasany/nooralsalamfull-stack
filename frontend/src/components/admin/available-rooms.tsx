"use client";

import { useRef } from "react";
import type { AvailableRoomType } from "@/server/services/dashboard.service";
import type { AdminMessages } from "@/i18n/admin";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Labels = Pick<
  AdminMessages,
  | "availableTonight"
  | "availableOfTotal"
  | "availableRoomsTitle"
  | "availableRoomsIntro"
  | "canSell"
  | "fullyBooked"
  | "roomReady"
  | "roomNeedsCleaning"
  | "reserve"
  | "reserveAnyRoom"
  | "noRoomsAvailable"
  | "unassignedNote"
  | "close"
  | "floor"
>;

const fmt = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function AvailableRoomsCard({
  count,
  total,
  byType,
  from,
  to,
  locale,
  canReserve,
  t,
}: {
  count: number;
  total: number;
  byType: AvailableRoomType[];
  from: string;
  to: string;
  locale: "en" | "ar" | "bn";
  canReserve: boolean;
  t: Labels;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reserveHref = (roomTypeId: string, roomId?: string) => {
    const q = new URLSearchParams({ roomTypeId, checkIn: from, checkOut: to });
    if (roomId) q.set("roomId", roomId);
    return `/admin/reservations/new?${q}`;
  };
  const visible = byType.filter((rt) => rt.sellable > 0 || rt.rooms.length > 0);

  return (
    <>
      <button type="button" className="stat-button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{t.availableTonight}</p>
          <p className={count > 0 ? "mt-2 text-2xl font-semibold tabular-nums text-ok-600" : "mt-2 text-2xl font-semibold tabular-nums text-danger-600"}>{count}</p>
          <p className="mt-1 text-xs text-brand-700 hover:underline">{fmt(t.availableOfTotal, { n: total })}</p>
        </Card>
      </button>

      <dialog
        ref={dialog}
        className="admin-dialog"
        aria-labelledby="available-rooms-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div>
            <h2 id="available-rooms-title" className="text-base font-semibold text-ink-900">
              {t.availableRoomsTitle} · {count}
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">{fmt(t.availableRoomsIntro, { from, to })}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
            {t.close}
          </Button>
        </div>
        <div className="space-y-4 p-5">
          {visible.length === 0 ? <p className="text-sm text-ink-500">{t.noRoomsAvailable}</p> : null}
          {visible.map((rt) => (
            <section key={rt.roomTypeId} className="rounded-xl border border-sand-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink-900">{rt.name[locale] || rt.name.en}</h3>
                  <p className={rt.sellable > 0 ? "text-xs text-ok-600" : "text-xs text-danger-600"}>
                    {rt.sellable > 0 ? fmt(t.canSell, { n: rt.sellable }) : t.fullyBooked}
                  </p>
                </div>
                {canReserve && rt.sellable > 0 ? (
                  <LinkButton href={reserveHref(rt.roomTypeId)} variant="outline" size="sm">
                    {t.reserveAnyRoom}
                  </LinkButton>
                ) : null}
              </div>
              {rt.sellable > 0 && rt.rooms.length > rt.sellable ? <p className="mt-2 text-xs text-warn-600">{fmt(t.unassignedNote, { n: rt.sellable })}</p> : null}
              {rt.rooms.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {rt.rooms.map((room) => {
                    const ready = room.status === "AVAILABLE" || room.status === "RESERVED";
                    return (
                      <li key={room.id} className="room-chip">
                        <span className="font-semibold tabular-nums">{room.number}</span>
                        <span className="text-xs text-ink-500">
                          {t.floor} {room.floor}
                        </span>
                        <Badge tone={ready ? "green" : "amber"}>{ready ? t.roomReady : t.roomNeedsCleaning}</Badge>
                        {canReserve && rt.sellable > 0 ? (
                          <LinkButton href={reserveHref(rt.roomTypeId, room.id)} size="sm">
                            {t.reserve}
                          </LinkButton>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
