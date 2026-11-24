# Atrium screenshots

The [current walkthrough](current/) was captured on 24 November 2026 from the local CRM and Ops builds using an isolated database and fictional accounts. The older captures in this folder document earlier versions and design explorations.

## CRM

| Area | Screens |
| --- | --- |
| Sign-in and dashboard | [Sign-in](current/01-crm-sign-in.jpg), [dashboard](current/02-dashboard.jpg), [dashboard on mobile](current/31-mobile-crm.jpg) |
| Leads and calendar | [Leads board](current/03-leads-board.jpg), [lead detail and notes](current/04-lead-detail.jpg), [calendar](current/05-calendar.jpg) |
| Inventory | [Listings](current/06-listings.jpg), [listing detail and brochure action](current/07-listing-detail.jpg), [inventory map](current/08-inventory-map.jpg) |
| Shortlists and messaging | [Shortlist builder](current/09-shortlists.jpg), [team DMs](current/11-team-messages.jpg), [broker side of client chat](current/14-broker-client-chat.jpg) |
| Guides | [Guides dashboard](current/15-guides.jpg), [guide editor](current/16-guide-editor.jpg) |
| Reporting and settings | [Money Map](current/20-money-map.jpg), [spend editor](current/21-money-spend-editor.jpg), [reports](current/22-reports.jpg), [settings](current/23-settings.jpg) |

## Client links

| Area | Screens |
| --- | --- |
| Shortlist | [Desktop](current/10-client-shortlist.jpg), [mobile](current/32-mobile-shortlist.jpg) |
| Private chat | [PIN prompt](current/12-client-chat-pin.jpg), [client chat with attachment](current/13-client-chat.jpg) |
| Buyer guides | [Public library](current/17-public-guide-library.jpg), [guide and request form](current/18-public-guide.jpg), [PDF download page](current/19-guide-download.jpg) |

## Platform Ops

[Operator sign-in](current/24-ops-sign-in.jpg) · [Overview](current/25-ops-overview.jpg) · [Organizations](current/26-ops-organizations.jpg) · [New organization](current/27-ops-new-organization.jpg) · [Organization and invite form](current/28-ops-organization-detail.jpg) · [Invites](current/29-ops-invites.jpg) · [Invite acceptance page](current/30-accept-invite.jpg)

## Verification

- Chromium walkthroughs exercised sign-in, lead notes, listing details, brochure download, the inventory map, shortlist creation and clipboard sharing, and opening the shortlist signed out.
- Messaging checks exercised team DMs, PIN-protected client access, replies in both directions, and attachment download.
- The public guide check submitted its form and downloaded the PDF. The Ops check created an invite and opened its acceptance page.
- The CRM dashboard and public shortlist were checked for horizontal overflow at 390 px. Desktop captures are 1440 × 1000 px.
- The separate chat regression suite passed, including link expiry, revocation, PIN lockout, and access handoff.
- The API regression suite passed 145 of 146 checks. The dashboard won-deals trend test expected 26 deals and received 27. The test selects by the lead's last update, while the endpoint uses the recorded win date when available.
- Money Map displayed AED for the fictional INR brokerage. Its API currently returns AED for every brokerage. The screenshot preserves the observed display.

Share tokens and PIN values are masked where displayed. The captures show representative states. [Planned buyer workflows](../../docs/WORKFLOWS.md) cover the proposed lead-linked shortlist and viewing request.
