-- ============================================================================
-- Wholesale ops: order lifecycle/edit, credit control (limit + aging),
-- end-of-day cash count.
-- ============================================================================

-- credit limit per customer (0 = no limit)
alter table public.customers add column if not exists credit_limit numeric(14,2) not null default 0;

-- end-of-day cash counts
create table public.cash_counts (
  id          uuid primary key default gen_random_uuid(),
  count_date  date not null default current_date,
  expected    numeric(14,2),
  counted     numeric(14,2) not null,
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.cash_counts enable row level security;
create policy cash_counts_staff_all on public.cash_counts
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.cash_counts to authenticated;

-- ---------------------------------------------------------------------------
-- update_order: replace an order's header + items (and its stock movements).
-- Used to adjust actual delivered weights / fix an order.
-- ---------------------------------------------------------------------------
create or replace function public.update_order(
  p_order uuid, p_customer uuid, p_order_date date, p_notes text, p_items jsonb
) returns void
language plpgsql security invoker set search_path = public
as $$
declare v_item jsonb;
begin
  update orders
     set customer_id = p_customer,
         order_date  = coalesce(p_order_date, order_date),
         notes       = p_notes,
         updated_at  = now()
   where id = p_order;

  delete from inventory_movements where order_id = p_order and type = 'sale_out';
  delete from order_items where order_id = p_order;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into order_items (order_id, product_id, quantity, unit_price, notes)
    values (p_order, (v_item ->> 'product_id')::uuid,
            coalesce((v_item ->> 'quantity')::numeric, 0),
            coalesce((v_item ->> 'unit_price')::numeric, 0),
            v_item ->> 'notes');
    insert into inventory_movements (product_id, moved_on, type, quantity, order_id, reference)
    values ((v_item ->> 'product_id')::uuid,
            coalesce(p_order_date, current_date), 'sale_out',
            -1 * coalesce((v_item ->> 'quantity')::numeric, 0), p_order, 'order');
  end loop;
end;
$$;
grant execute on function public.update_order(uuid, uuid, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- void_order: mark void and return its cuts to stock.
-- ---------------------------------------------------------------------------
create or replace function public.void_order(p_order uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  delete from inventory_movements where order_id = p_order and type = 'sale_out';
  update orders set status = 'void', updated_at = now() where id = p_order;
end;
$$;
grant execute on function public.void_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- report_receivables: AR aging per customer (FIFO: payments applied to oldest
-- debt first; opening balance treated as oldest). Only customers who owe (>0).
-- ---------------------------------------------------------------------------
create or replace function public.report_receivables()
returns table(customer_id uuid, name text, balance numeric,
              d0_30 numeric, d31_60 numeric, d61_90 numeric, d90plus numeric, oldest_days int)
language plpgsql security invoker set search_path = public
as $$
declare
  c record; d record; pay numeric; rem numeric; agedays int;
  b0 numeric; b1 numeric; b2 numeric; b3 numeric; oldest int;
begin
  for c in select id, customers.name as cname, opening_balance from customers loop
    select coalesce(sum(amount), 0) into pay from payments where payments.customer_id = c.id;
    b0 := 0; b1 := 0; b2 := 0; b3 := 0; oldest := 0;
    for d in
      select '1900-01-01'::date as dt, c.opening_balance as amt where c.opening_balance > 0
      union all
      select o.order_date as dt, coalesce(sum(oi.line_total), 0) as amt
      from orders o join order_items oi on oi.order_id = o.id
      where o.customer_id = c.id and o.status <> 'void'
      group by o.order_date
      order by dt
    loop
      rem := d.amt;
      if pay >= rem then pay := pay - rem; rem := 0;
      else rem := rem - pay; pay := 0; end if;
      if rem > 0 then
        agedays := case when d.dt = '1900-01-01'::date then 9999 else (current_date - d.dt) end;
        if agedays > oldest then oldest := agedays; end if;
        if agedays <= 30 then b0 := b0 + rem;
        elsif agedays <= 60 then b1 := b1 + rem;
        elsif agedays <= 90 then b2 := b2 + rem;
        else b3 := b3 + rem; end if;
      end if;
    end loop;
    if (b0 + b1 + b2 + b3) > 0 then
      customer_id := c.id; name := c.cname; balance := b0 + b1 + b2 + b3;
      d0_30 := b0; d31_60 := b1; d61_90 := b2; d90plus := b3; oldest_days := oldest;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function public.report_receivables() to authenticated;
