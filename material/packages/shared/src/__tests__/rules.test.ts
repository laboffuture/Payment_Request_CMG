import { describe, expect, it } from 'vitest';
import {
  MR_TRANSITIONS,
  PO_TRANSITIONS,
  RFQ_VENDOR_TRANSITIONS,
  canTransition,
  chipFor,
  MR_ST,
} from '../statuses.js';
import { NAV, resolveDeepLink } from '../nav.js';
import { EVENTS, EVENT_CODES, defaultRule } from '../events.js';
import { ROLES, UNITS, UNIT_NAMES, isBuyer, roleMatch } from '../enums.js';

describe('status machines (§6)', () => {
  it('lets QS approve, send back or reject an MR — and nothing else', () => {
    expect(canTransition(MR_TRANSITIONS, 'QS_PENDING', 'APPROVED')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'QS_PENDING', 'SENT_BACK')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'QS_PENDING', 'REJECTED')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'QS_PENDING', 'CLOSED')).toBe(false);
  });

  it('will not reopen a closed or rejected MR', () => {
    expect(MR_TRANSITIONS.CLOSED).toEqual([]);
    expect(MR_TRANSITIONS.REJECTED).toEqual([]);
  });

  it('sends a resubmitted MR back to the PM, not straight to QS', () => {
    expect(canTransition(MR_TRANSITIONS, 'SENT_BACK', 'PM_PENDING')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'SENT_BACK', 'QS_PENDING')).toBe(false);
  });

  it('routes a submitted MR through the PM before QS ever sees it', () => {
    expect(canTransition(MR_TRANSITIONS, 'DRAFT', 'PM_PENDING')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'DRAFT', 'QS_PENDING')).toBe(false);
    expect(canTransition(MR_TRANSITIONS, 'PM_PENDING', 'QS_PENDING')).toBe(true);
    // The PM can stop it outright, so it never reaches QS.
    expect(canTransition(MR_TRANSITIONS, 'PM_PENDING', 'REJECTED')).toBe(true);
    expect(canTransition(MR_TRANSITIONS, 'PM_PENDING', 'APPROVED')).toBe(false);
  });

  it('allows a revision of an approved PO but never of a cancelled one', () => {
    expect(canTransition(PO_TRANSITIONS, 'APPROVED', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransition(PO_TRANSITIONS, 'PARTIAL', 'PENDING_APPROVAL')).toBe(true);
    expect(PO_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('lets a rejected PO be edited and resubmitted', () => {
    expect(canTransition(PO_TRANSITIONS, 'REJECTED', 'PENDING_APPROVAL')).toBe(true);
  });

  it('will not let a vendor who declined go on to quote', () => {
    expect(RFQ_VENDOR_TRANSITIONS.DECLINED).toEqual([]);
    expect(canTransition(RFQ_VENDOR_TRANSITIONS, 'ACCEPTED', 'QUOTED')).toBe(true);
    // A quote may be updated until the due time.
    expect(canTransition(RFQ_VENDOR_TRANSITIONS, 'QUOTED', 'QUOTED')).toBe(true);
    expect(canTransition(RFQ_VENDOR_TRANSITIONS, 'INVITED', 'QUOTED')).toBe(false);
  });

  it('falls back to a grey chip for an unknown status', () => {
    expect(chipFor(MR_ST, 'APPROVED')).toEqual({ label: 'In progress', tone: 'ac' });
    expect(chipFor(MR_ST, 'WHAT')).toEqual({ label: 'WHAT', tone: 'gry' });
  });
});

describe('roles (§3)', () => {
  it('treats a procurement manager as a buyer', () => {
    expect(isBuyer('PROC')).toBe(true);
    expect(isBuyer('PROC_MGR')).toBe(true);
    expect(isBuyer('STORE')).toBe(false);
  });

  it('delivers a PROC notification to a procurement manager too', () => {
    expect(roleMatch('PROC', 'PROC_MGR')).toBe(true);
    expect(roleMatch('PROC', 'PROC')).toBe(true);
    // …but not the other way round.
    expect(roleMatch('PROC_MGR', 'PROC')).toBe(false);
    expect(roleMatch('QS', 'SITE')).toBe(false);
  });

  it('gives every role a sidebar, and every vendor item stays inside the portal', () => {
    for (const role of ROLES) expect(NAV[role].length).toBeGreaterThan(0);

    for (const item of NAV.VENDOR) {
      expect(
        item.href.startsWith('/vendor') || item.href === '/notifications',
      ).toBe(true);
    }
  });

  it('puts Home first for staff and Enquiries first for a vendor', () => {
    expect(NAV.SITE[0]!.href).toBe('/');
    expect(NAV.VENDOR[0]!.label).toBe('Enquiries');
  });
});

describe('deep links (§4)', () => {
  it('routes each prototype link kind to its page', () => {
    expect(resolveDeepLink('mr:abc')).toBe('/mrs/abc');
    expect(resolveDeepLink('po:abc')).toBe('/pos/abc');
    expect(resolveDeepLink('rfq:abc')).toBe('/rfqs/abc');
    expect(resolveDeepLink('vrfq:abc')).toBe('/vendor/rfqs/abc');
    expect(resolveDeepLink('iss:abc')).toBe('/issues/abc');
    expect(resolveDeepLink('doc:abc')).toBe('/docs?open=abc');
  });

  it('refuses anything it does not recognise', () => {
    expect(resolveDeepLink('nonsense')).toBeNull();
    expect(resolveDeepLink('mr:')).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
  });
});

describe('notification events (§9)', () => {
  it('describes every event and defaults it to portal + email', () => {
    for (const code of EVENT_CODES) {
      expect(EVENTS[code].label).toBeTruthy();
      expect(EVENTS[code].goesTo).toBeTruthy();
      expect(defaultRule(code).portal).toBe(true);
    }
  });

  it('offers a vendor email only for the two events that reach vendors', () => {
    const allowed = EVENT_CODES.filter((c) => EVENTS[c].vendorEmailAllowed);
    expect(allowed).toEqual(['RFQ_SENT', 'PO_APPROVED']);
    // The prototype ships with only RFQ_SENT switched on.
    expect(defaultRule('RFQ_SENT').vendorEmail).toBe(true);
    expect(defaultRule('PO_APPROVED').vendorEmail).toBe(false);
  });
});

describe('units of measure', () => {
  it('offers the site units the engineers actually use', () => {
    // Added after the first build, on request from site.
    for (const unit of ['Pkt', 'Sqft', 'Cft', 'Rmt']) {
      expect(UNITS).toContain(unit);
    }
  });

  it('spells every abbreviation out, so Cft and Cum cannot be confused', () => {
    for (const unit of UNITS) {
      expect(UNIT_NAMES[unit]).toBeTruthy();
      expect(UNIT_NAMES[unit].startsWith(unit)).toBe(true);
    }
  });
});
