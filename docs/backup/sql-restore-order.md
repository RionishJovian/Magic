# SQL restore order (schema + Lovable paste scripts)

Prefer applying **supabase/migrations/** in filename order on a fresh DB.
Then re-run any missing **.lovable/sql/** pastes if the live Cloud project drifted.

## A. supabase/migrations (lexicographic = apply order)

```
20260723130719_c414ce6e-8fc5-431a-9695-95c2337cd97d.sql
20260723160152_00b00913-4915-4ea8-a370-e3fc391ba343.sql
20260723164619_c7ca5a11-34cf-45e5-8e57-962134beefe7.sql
20260723165412_0082cb94-7450-43c8-baca-0bb69928bff9.sql
20260723171531_96581dce-b6da-4761-ae9e-30b1dce2abfd.sql
20260724131704_0a7e0d05-34f5-4a60-af41-e9d4312ec57a.sql
20260724141318_a9c0aba3-bb54-4a2b-ab8b-4e6b22110c10.sql
20260724144934_29c3f8fe-3d54-42df-99a7-8f2411a475a8.sql
20260724152433_2578096b-0c67-4487-9f8e-1811e06819b7.sql
20260724155131_f36393d6-e3cc-4ccf-b7f8-c1a7943913c6.sql
20260724182852_9129cb73-a890-46c3-b2ff-4e530e79ce73.sql
20260724191341_74511e4b-a300-4204-a9ce-6653d9e403d1.sql
20260724215955_dfaaac75-8760-4088-879a-10ed0ba9b96c.sql
20260724221233_8b773fdf-73af-4f04-ad14-0733bf2071b6.sql
20260725002033_ca8a708d-9769-4d3f-912e-9237d0b3a461.sql
20260725012916_0b06d13a-c1dd-4f62-88d9-e1d16daaa39e.sql
20260725013051_278866bf-6260-4c5a-8d87-73627e43c775.sql
20260725013832_f8d34f7a-ce0c-4ffa-96c1-632d0211a03a.sql
20260725013855_2c4b067a-3382-4685-84b7-f04ce24a76d3.sql
20260725021734_6cca8ed9-78ef-4ea0-8f70-363353e7ce95.sql
20260725131245_090d8ee2-b554-4cd9-ab25-038a2303ace4.sql
20260725202829_fb868deb-0eb3-462b-8514-7edd9155a39b.sql
20260725202859_7568d20a-7f3d-4755-93c2-b5d36448dd7d.sql
20260725204114_f6d287e4-8e2c-4c42-803f-52c0d5afcf0d.sql
20260725205119_4a7d91ff-f69b-4967-8d87-0fed6d034f4f.sql
20260725210913_32b1eea1-2997-47f6-b471-69e8eb2eaf85.sql
20260725213123_cd8f32a0-f072-429d-8ef4-cd96f10c9854.sql
20260807084100_e2faeb47-b6bc-460a-97e4-7ed59dc38318.sql
20260807201555_f5299663-508d-4392-b7da-63277707eb1b.sql
20260807205420_2aaabbd1-96ba-4ac4-a493-909f81bc5328.sql
20260808053401_994d9a9b-a5b9-4167-a014-c7d3a73853b2.sql
20260808082037_82e0bbee-fb12-4a45-bf4d-f4747d832a5b.sql
20260808084203_b7a81019-0ca1-4c85-8ff6-ca07d120fce0.sql
20260808085425_794af3d3-d00e-4697-9a7f-63eba77e8ca5.sql
20260808091149_a900cdc0-10c9-4373-b52f-6d840d7eda0f.sql
20260808094458_e64efcab-796b-4850-9278-f2bd04104213.sql
20260808131256_ed9a0a20-91ce-42fd-9358-5c7847d593c7.sql
20260808231230_6e722883-c2e7-459b-82be-eb3c884f77fa.sql
20260809124622_94a25888-7b11-40fb-bca1-499c82cea912.sql
20260809152827_e4d04836-909a-4a44-8ebf-f4e6325ec7b6.sql
20260809172537_f81b66d9-9312-4058-9f01-4b0189c81158.sql
20260809173830_f8a3f850-7f99-4e93-90bc-234b62edf995.sql
20260809180349_34a549a1-4122-4baf-a10d-333a330bfd63.sql
20260809180422_8f039c91-5934-45d2-acff-b65f9a9d2ddf.sql
20260809182107_ad82d313-9112-4706-94ad-c99417096d64.sql
20260809190107_380e01a3-12c3-484c-b958-fdf9f1ee6c00.sql
20260810041918_cc25e152-5314-4a2c-9399-06fd35d6ce10.sql
20260810144037_c32c860b-971d-40dc-b3dc-6e9c4879fd04.sql
20260810150545_7f95a078-1f30-4af8-8b44-9fb4956d077e.sql
20260810154056_c02791bb-a5aa-4099-8919-66f90a096217.sql
20260810155927_7a41d333-fe18-4611-bb85-9b1fa6219009.sql
20260810193224_3ff99d25-22d5-4700-b28f-cf39068fccb4.sql
20260810194427_12191c2a-dfa3-46e0-8065-a86ba78cf311.sql
20260811094838_5d4f3cda-4683-4d8c-b943-7469fdec53ff.sql
20260811212713_f3c7c0df-87a8-462f-950b-3183a82dfe2c.sql
20260811221958_d88814da-aa7d-4a8f-8fb1-110940fc3af4.sql
20260811222428_a5b395d2-5067-403a-b823-2d05e9610c8d.sql
20260812095456_b122634b-ebd7-4c48-9b6a-92a0341b1874.sql
20260812100132_1bacfaeb-3081-4148-80e5-4bb42023a665.sql
20260812130849_c3f876bc-1a87-4af1-ab62-17bcc063a9a3.sql
20260812131529_487018f2-658c-421e-8ecf-ee5b5a5fad12.sql
20260812172842_62495831-fbe6-4e8c-af51-122f932ef6c7.sql
20260812175102_59ce0984-6ce1-4dc0-872d-f2460c9a5edd.sql
20260812175458_f2281fc6-a408-4547-a21a-75d21fbb2d99.sql
20260812184154_fc32a657-4401-41ab-8e64-11089dc7b41d.sql
20260812192606_66d849e4-577d-4001-976b-20cfc1060f84.sql
20260814061018_f4e4f1cd-d8d4-4b8f-a63d-a3e6ab51bcdf.sql
20260814074023_62a923b9-4c8f-4a2b-9bc1-47004206df3e.sql
20260815143000_sandphase1_virtual_router.sql
20260815180000_tunnel_hubs_platform_admin_only.sql
20260815201500_sapphire_plus_300k.sql
20260816071000_fix_quota_trigger_sites_connection_mode.sql
20260816160000_drop_agentless_outbound_tunnel.sql
20260816180000_syslog_ingest_production.sql
20260816181500_syslog_ingest_hash_idempotent.sql
20260816190000_connection_mode_cloud_to_hub.sql
20260816190000_phase4_incident_kinds.sql
20260816210000_portal_guest_modes_and_grants.sql
20260816213000_portal_custom_payment_methods.sql
20260816222025_af666fa7-0ec3-4304-a885-ef4c20ddfe94.sql
20260817100600_emerald_sapphire_device_quota.sql
20260817120000_sapphire_pricing_1m.sql
20260817180000_operator_feature_grants.sql
20260817220000_terminal_templates_useful_sectors.sql
20260818143000_admin_notifications_delete.sql
20260818160000_production_security_hardening.sql
20260818172000_list_features_live_grant_tables.sql
20260818184500_ticket_activation_alerts.sql
20260818200000_global_platform_table_rls.sql
20260818210000_syslog_events_tenant_insert.sql
20260818220000_default_data_quota_voucher_plans.sql
20260818220000_role_defaults_select_scope.sql
20260818240000_voucher_portal_shopfloor_access.sql
20260820161500_sites_tenant_rls.sql
20260821140000_launch_promo_option_b.sql
20260821160000_drop_portal_checkout_tokens.sql
20260822133000_grand_opening_promo_dates.sql
20260822160000_pricing_standard_950k.sql
```

## B. .lovable/sql (operator paste pack — safe to re-run most)

Recommended go-live order if unsure what Cloud already has:

1. go-live-run1-phase4-incidents.sql
2. go-live-run2-quota-trigger.sql
3. sites-tenant-rls.sql
4. voucher-portal-deploy-access.sql
5. voucher-portal-deploy-features.sql
6. security-run1-storage.sql → security-run2 → security-run3 → security-run4
7. pricing-standard-950k.sql (or grand-opening-promo-30-off.sql)
8. Remaining files in .lovable/sql/ as needed

### Full .lovable/sql inventory

```
default-data-quota-voucher-plans.sql
drop-portal-checkout-tokens.sql
go-live-run1-phase4-incidents.sql
go-live-run2-quota-trigger.sql
grand-opening-promo-30-off.sql
launch-promo-option-b.sql
list-features-live-grants.sql
operator-feature-grants.sql
portal-modes-run1-grants.sql
portal-modes-run2-payment-methods.sql
pricing-standard-950k.sql
remove-virtual-sandbox-routers.sql
security-run1-storage.sql
security-run2-definer-grants.sql
security-run3-global-platform-rls.sql
security-run4-role-defaults-select.sql
sites-tenant-rls.sql
syslog-events-tenant-insert.sql
terminal-templates-useful-sectors.sql
ticket-activation-alerts.sql
voucher-portal-deploy-access.sql
voucher-portal-deploy-features.sql
```

## C. Live data

Migrations restore **schema**. Customer data (routers, vouchers, sites) needs a
separate encrypted `pg_dump` from Lovable Cloud / Supabase — **not** stored in this repo.
