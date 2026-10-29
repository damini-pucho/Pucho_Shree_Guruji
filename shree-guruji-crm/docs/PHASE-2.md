# Phase 2 and additional modules — kept separate from Phase 1

None of these are built, simulated or shown in the Phase 1 UI. They depend on client inputs and access still pending in the MoMs.

| Module | From | What it needs | Seam already in Phase 1 |
|---|---|---|---|
| WhatsApp qualification bot (persona, location, requirement → auto-route) | MoM 16 Sep, Phase 2 | WhatsApp Meta API access; final question flow | `POST /api/inbound/leads` creates a lead with source/type/purpose labels and the same routing + duplicate rules as manual entry |
| Mukwas campaign automation (distributor → ASM, retailer → distributor details, consumer pricing / delivery fee) | MoM 28 Sep, Module 2 | ASM / distributor mapping by area, price list, delivery-fee rules per city (open question Q2) | Same inbound endpoint; lead types and routing teams on Setup |
| CTM / IVR pre-capture of City and Name | MoM 28 Sep | Decision whether CTM pushes via API or Pucho builds the IVR (open question Q1); 800-number details | Inbound endpoint matches the managed city list |
| AI image deduplication (auto-rickshaw registration numbers) | MoM 28 Sep, Module 3 | 5–10 sample images and detection criteria from the client | — (separate module) |
| Task management with project grouping and WhatsApp reminders at 10 AM / 2 PM / 6 PM | MoM 28 Sep, Module 4 | WhatsApp Meta API access | Phase 1 reminders are in-app only |
| Outlook / Gmail mailbox capture, Meta (agency) lead ads | MoM 16 Sep | Mailbox / agency credentials | Inbound endpoint |
| Hindi / Gujarati labels | Prototype profile page | Translations | — |

WhatsApp and Call buttons in Phase 1 are plain `wa.me` click-to-chat and `tel:` links that open the person's own WhatsApp or
dialler — no messaging API is called or claimed.
