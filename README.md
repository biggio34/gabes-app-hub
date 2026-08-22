# Luna Haus Purchasing

Monday restock book for **Luna Haus Salon** in St. Michael. This takes over the purchasing app Grok Build started on the salon computer: backbar counts, 6-pack orders for Paul at Beauty Bell / EBW, SalonCentric leftovers, and the 9am Central ping.

## What it does

- Tracks on-hand vs par for Avyna color, Tailor's grooming, and the Redken SKUs from the May SalonCentric order
- Builds a weekly cart and drafts the email to Paul Sunberg (`paul@beautybellcollective.com`)
- Uses 6-pack pricing when a SKU has it — that is still the best price on Paul's lists
- Counts down to the next Monday 9:00 America/Chicago reminder
- Includes the purchasing bot that replaced the Grok Bot chat

Counts live in the browser (`localStorage`). Starter prices are placeholders so you can type in the current Avyna and Tailor's sheets. Avyna was flagged for a 5–15% increase after the June 23 list.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

## Typical Monday

1. Open the app around 9 Central (or tap the reminder email)
2. Check **Inventory** against the backbar
3. **Order → Fill below-par** for Beauty Bell
4. Open the draft in email, send it to Paul, then **Save as sent**
5. When the box arrives, **Mark received** so counts come back up
