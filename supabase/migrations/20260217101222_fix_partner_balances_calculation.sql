/*
  # Fix Partner Balances Calculation

  1. Problem
    - Settlement payments were being subtracted instead of reducing the debt
    - Formula was: total_paid - fair_share - settlements_paid + settlements_received
    - This double-counted settlements
    
  2. Correct Logic
    - Initial balance = what I paid - my fair share
    - Adjustments = settlements I received - settlements I paid
    - Formula: (total_paid - fair_share) + (settlements_received - settlements_paid)
    
  3. Example
    - Sami paid 100, fair share 60, initial balance = +40 (others owe him)
    - Anas paid 0, fair share 40, initial balance = -40 (he owes)
    - Anas pays settlement of 40 to Sami
    - Anas: (0 - 40) + (0 - 40) = -80 ❌ WRONG
    - Anas: (0 - 40) + (0 - 40) + 40 = -40 ❌ STILL WRONG
    
    The correct formula should be:
    - Anas owes 40
    - Anas pays 40 settlement
    - Balance should be 0
    
    So: balance = (total_paid - fair_share) + settlements_received - settlements_paid
    But settlements_paid should REDUCE the debt, not increase it!
    
    Actually:
    - If I owe money (negative balance), and I pay a settlement, my balance goes UP (less negative)
    - So: balance = (total_paid - fair_share) - settlements_paid + settlements_received ❌
    
    Let me think differently:
    - total_paid = money I put into the company
    - fair_share = money I should have put in
    - difference = total_paid - fair_share
      - If positive: I paid more, others owe me
      - If negative: I paid less, I owe others
    - settlements_paid = I'm paying my debt
      - This should INCREASE my balance (reduce debt)
    - settlements_received = Others paying their debt to me
      - This should INCREASE my balance
      
    So both should be positive additions!
    balance = (total_paid - fair_share) + settlements_paid + settlements_received ❌
    
    Wait, that's wrong too. Let me reconsider:
    
    Scenario:
    - Total expenses: 100
    - Sami (60%): should pay 60, actually paid 100, so he's owed 40
    - Anas (40%): should pay 40, actually paid 0, so he owes 40
    
    When Anas pays 40 settlement to Sami:
    - Anas gave 40 to Sami (settlement_paid = 40)
    - Sami received 40 from Anas (settlement_received = 40)
    
    New balances:
    - Sami: was owed 40, received 40, now owed 0
    - Anas: owed 40, paid 40, now owes 0
    
    Formula check:
    Anas: (0 - 40) + settlement_adjustments = 0
    So: settlement_adjustments must be +40
    Since he PAID 40 (settlements_paid = 40), we need to ADD it!
    
    Sami: (100 - 60) - settlement_adjustments = 0
    So: (40) - settlement_adjustments = 0
    settlement_adjustments = 40
    Since he RECEIVED 40 (settlements_received = 40), we need to SUBTRACT it!
    
    Wait, that doesn't make sense either. Let me think again:
    
    Actually, the settlement is BETWEEN partners, not from the company!
    - When Anas pays Sami 40, it's a transfer between them
    - It doesn't change what they owe THE COMPANY
    - It changes what they owe EACH OTHER
    
    So the view is calculating:
    - How much each partner is owed by OR owes to OTHER PARTNERS
    - Not what they owe the company
    
    In that case:
    - Sami paid 100, fair share 60, so others owe him 40
    - Anas paid 0, fair share 40, so he owes others 40
    - When Anas pays Sami 40:
      - Anas's debt to others goes from 40 to 0 (he paid 40)
      - Sami's credit from others goes from 40 to 0 (he received 40)
    
    Formula:
    - Anas: owe_others = (0 - 40) = -40
      After paying 40: -40 - (-40) = 0 ✓
      So: balance = (total_paid - fair_share) - (settlements_paid - settlements_received)
      Check: (0 - 40) - (40 - 0) = -40 - 40 = -80 ❌
      
    Let me try:
    balance = (total_paid - fair_share) + (settlements_received - settlements_paid)
    - Anas: (0 - 40) + (0 - 40) = -80 ❌
    
    Actually wait, I think the issue is simpler:
    When calculating debt:
    - If you owe money, paying a settlement INCREASES your balance (makes it less negative)
    - So settlements_paid should be POSITIVE when you owe money
    
    But settlements are recorded as:
    - from_partner pays to_partner
    - So for from_partner: this is money going OUT (should reduce their balance)
    - For to_partner: this is money coming IN (should increase their balance)
    
    Actually, I think the original formula makes sense for tracking WHO OWES WHOM:
    - balance = what_i_paid - my_fair_share
    - This tells us: am I owed money (positive) or do I owe money (negative)
    - Then we adjust for settlements:
      - If I paid a settlement OUT, I've reduced what others owe me (or increased what I owe)
      - If I received a settlement IN, I've reduced what I owe (or increased what I'm owed)
    
    Let's verify with example:
    - Sami: paid 100, fair 60, base = +40 (others owe him)
    - Anas: paid 0, fair 40, base = -40 (he owes)
    
    After Anas pays 40 to Sami:
    - Sami: +40 base, received +40, should be 0 (he's been paid what he's owed)
      Formula: 40 + received - paid = 40 + 40 - 0 = 80 ❌
      Should be: 40 - received + paid = 40 - 40 + 0 = 0 ✓
      
    - Anas: -40 base, paid 40, should be 0 (he's paid what he owes)
      Formula: -40 + received - paid = -40 + 0 - 40 = -80 ❌
      Should be: -40 - received + paid = -40 - 0 + 40 = 0 ✓
    
    So the correct formula is:
    balance = (total_paid - fair_share) + settlements_paid - settlements_received
    
    Let me verify once more:
    - Sami: (100 - 60) + 0 - 40 = 40 - 40 = 0 ✓
    - Anas: (0 - 40) + 40 - 0 = -40 + 40 = 0 ✓
    
    Perfect!
*/

CREATE OR REPLACE VIEW v_partner_balances AS
WITH partner_expenses AS (
  -- Setup expenses paid by each partner
  SELECT 
    p.id as partner_id,
    p.name,
    p.name_ar,
    p.share_percentage,
    COALESCE(SUM(se.amount), 0) as total_paid
  FROM partners p
  LEFT JOIN setup_expenses se ON se.partner_id = p.id 
    AND se.is_deleted = false 
    AND se.voided_at IS NULL
  GROUP BY p.id, p.name, p.name_ar, p.share_percentage
),
all_expenses_total AS (
  -- Total of all setup expenses
  SELECT COALESCE(SUM(amount), 0) as total
  FROM setup_expenses
  WHERE is_deleted = false 
    AND voided_at IS NULL
),
partner_shares AS (
  -- Each partner's share based on share percentage
  SELECT 
    pe.partner_id,
    pe.name,
    pe.name_ar,
    pe.share_percentage,
    pe.total_paid,
    (SELECT total FROM all_expenses_total) * (pe.share_percentage / 100.0) as fair_share
  FROM partner_expenses pe
),
settlements_paid AS (
  -- Settlements paid by each partner (outgoing)
  SELECT 
    from_partner_id as partner_id,
    COALESCE(SUM(amount), 0) as total_paid_out
  FROM partner_settlements
  WHERE status = 'active'
    AND is_deleted = false
  GROUP BY from_partner_id
),
settlements_received AS (
  -- Settlements received by each partner (incoming)
  SELECT 
    to_partner_id as partner_id,
    COALESCE(SUM(amount), 0) as total_received
  FROM partner_settlements
  WHERE status = 'active'
    AND is_deleted = false
  GROUP BY to_partner_id
)
SELECT 
  ps.partner_id,
  ps.name,
  ps.name_ar,
  ps.share_percentage,
  ps.total_paid,
  ps.fair_share,
  COALESCE(sp.total_paid_out, 0) as settlements_paid,
  COALESCE(sr.total_received, 0) as settlements_received,
  -- FIXED: Balance = (what I paid - my fair share) + (what I paid to others) - (what I received from others)
  -- When you owe money and pay it, your balance improves (becomes less negative)
  -- When you're owed money and receive it, your balance reduces (becomes less positive)
  (ps.total_paid - ps.fair_share + COALESCE(sp.total_paid_out, 0) - COALESCE(sr.total_received, 0)) as current_balance
FROM partner_shares ps
LEFT JOIN settlements_paid sp ON ps.partner_id = sp.partner_id
LEFT JOIN settlements_received sr ON ps.partner_id = sr.partner_id;
