-- Fix RLS policies for crm_cost_centers and crm_cost_items:
-- Add WITH CHECK clause so authenticated users can INSERT rows belonging to their business.

DROP POLICY IF EXISTS "owner_cost_centers" ON crm_cost_centers;
CREATE POLICY "owner_cost_centers" ON crm_cost_centers
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "owner_cost_items" ON crm_cost_items;
CREATE POLICY "owner_cost_items" ON crm_cost_items
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()));
