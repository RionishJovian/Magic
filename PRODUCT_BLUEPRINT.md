# 📘 MikroMagic Product Blueprint
**Version:** 1.0
**Status:** Active
**Lead Architect:** Hermes Agent

## 🎯 Vision
Transform MikroMagic from a technical utility into a luxury SaaS product. The focus is on **Proactive Value**, **Trust**, and **Frictionless Onboarding**.

---

## 🗺️ Implementation Map

### 1. Proactive AI Notification System
**Objective:** Shift from "On-Demand Scan" to "Proactive Warning."
**State:** `[BUILDING]`

- **Architectural Flow:**
  `monitoring.server.ts` (Detection) $ightarrow$ `admin_notifications` (Table) $ightarrow$ `NotificationCenter.tsx` (UI) $ightarrow$ `Push/Email Service` (External).
- **Schema Changes:**
  - Ensure `admin_notifications` table exists with: `recipient_id`, `kind`, `title`, `body`, `read_at`, `created_at`.
- **Acceptance Criteria:**
  - [ ] Health sweep triggers an entry in `admin_notifications` upon threshold breach.
  - [ ] Frontend displays a real-time toast or badge when a new notification arrives.
  - [ ] User can click the notification to go directly to the affected router's health page.

---

### 2. "First 5 Minutes" Setup Wizard
**Objective:** Eliminate onboarding friction for the Local Connector.
**State:** `[PENDING]`

- **Architectural Flow:**
  `SetupWizard.tsx` (State Machine) $ightarrow$ `connector-status.server.ts` (Probe) $ightarrow$ `User Experience`.
- **UI Requirements:**
  - Step 1: OS Detection $ightarrow$ Download Link.
  - Step 2: Installation Guide (Interactive Checklist).
  - Step 3: Connectivity Heartbeat (Live "Waiting for Connection..." $ightarrow$ "Connected ✅").
- **Acceptance Criteria:**
  - [ ] User can complete the setup without leaving the app.
  - [ ] The wizard automatically detects when the connector first hits the VPS.

---

### 3. Luxury Landing Page & Trust Layer
**Objective:** Increase conversion rate via psychological triggers (Social Proof & Authority).
**State:** `[PENDING]`

- **Component A: The "Wow" Loop**
  - Implementation: Auto-playing, muted, looped MP4/WebM of the Liquid-Glass portal.
  - Placement: Hero section, immediately below the main H1.
- **Component B: The Security Fortress**
  - Implementation: A dedicated section with icons representing "AES-256," "End-to-End Tunneling," and "Zero-Knowledge Privacy."
- **Acceptance Criteria:**
  - [ ] Video loads in < 1s and doesn't block page render.
  - [ ] Security section clearly explains the "Local Connector" safety.

---

### 4. Freemium Revenue Engine
**Objective:** Capture leads via a free tier and monetize via a Pro tier.
**State:** `[PENDING]`

- **Architectural Flow:**
  `middleware.ts` (Limit Check) $ightarrow$ `user_roles` (Tier Lookup) $ightarrow$ `PaywallUI.tsx`.
- **Logic:**
  - **Free Tier**: 1 Router, 50 Vouchers/mo, Basic Health.
  - **Pro Tier**: Unlimited Routers, Unlimited Vouchers, Proactive AI Alerts.
- **Acceptance Criteria:**
  - [ ] System prevents adding a 2nd router for "Free" users.
  - [ ] "Upgrade to Pro" modal triggers upon reaching any limit.

---

## 🛡️ Governance Rules for Follower Agents
1. **Consult the Blueprint**: Before any feature work, check the `State` and `Architectural Flow`.
2. **Atomic Commits**: One feature = one commit. No "bundle" updates.
3. **Layering**: Never put SQL in the UI. Follow: `UI` $ightarrow$ `Server Function` $ightarrow$ `Service` $ightarrow$ `DB`.
4. **Verify First**: Every feature must have an Acceptance Criteria checklist marked as `[VERIFIED]` before the task is closed.
