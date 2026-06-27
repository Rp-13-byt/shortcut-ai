// app/api/webhooks/stripe/route.ts

import { NextResponse } from 'next/server';
import { lockIdempotencyKey, markIdempotentDone, unlockIdempotencyKey } from '@/lib/idempotency';
import { prisma, withTransaction } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2026-06-24.dahlia',
});

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock'
    );
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed:`, err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // 1. Idempotency Check using the Stripe Event ID
  // Stripe explicitly guarantees that event.id is globally unique for at least 30 days.
  if (await lockIdempotencyKey(`stripe:${event.id}`, 30 * 86400)) {
    console.log(`[Stripe Webhook] Event ${event.id} already processed. Acking.`);
    return NextResponse.json({ message: 'Already processed' }, { status: 200 });
  }

  try {
    // 2. Handle the event within a Transaction
    await withTransaction(async (tx) => {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          console.log(`[Stripe] Payment succeeded for ${event.data.object.id}`);
          // Update Subscription Status logic
          break;
        case 'customer.subscription.deleted':
          console.log(`[Stripe] Subscription deleted for ${event.data.object.id}`);
          // Handle cancellation
          break;
        default:
          console.log(`[Stripe] Unhandled event type ${event.type}`);
      }
    });

    // 3. Mark event as fully processed
    await markIdempotentDone(`stripe:${event.id}`, 30 * 86400);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to process event ${event.id}:`, error);
    // 4. Unlock key so Stripe's automated retry can attempt again later
    await unlockIdempotencyKey(`stripe:${event.id}`);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
