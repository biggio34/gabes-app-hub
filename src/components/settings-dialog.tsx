"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export function SettingsDialog() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const s = store.settings;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Settings">
            <Settings />
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Salon & suppliers</DialogTitle>
          <DialogDescription>
            Used on purchase-order emails and the Monday 9 Central ping.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Salon">
            <Input
              value={s.salonName}
              onChange={(e) => store.updateSettings({ salonName: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <Input
                value={s.ownerName}
                onChange={(e) => store.updateSettings({ ownerName: e.target.value })}
              />
            </Field>
            <Field label="From email">
              <Input
                value={s.fromEmail}
                onChange={(e) => store.updateSettings({ fromEmail: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reminder emails (comma separated)">
            <Input
              value={s.reminderEmails.join(", ")}
              onChange={(e) =>
                store.updateSettings({
                  reminderEmails: e.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rep name">
              <Input
                value={s.supplierName}
                onChange={(e) =>
                  store.updateSettings({ supplierName: e.target.value })
                }
              />
            </Field>
            <Field label="Rep email">
              <Input
                value={s.supplierEmail}
                onChange={(e) =>
                  store.updateSettings({ supplierEmail: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Company">
            <Input
              value={s.supplierCompany}
              onChange={(e) =>
                store.updateSettings({ supplierCompany: e.target.value })
              }
            />
          </Field>
          <Field label="Rep phone">
            <Input
              value={s.supplierPhone}
              onChange={(e) =>
                store.updateSettings({ supplierPhone: e.target.value })
              }
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => store.resetCatalog()}>
              Reset starter catalog
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Starter prices are placeholders so you can edit them to match Paul’s
            2026 Avyna and Tailor&apos;s lists. Six-pack is still the best price
            on those sheets.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
