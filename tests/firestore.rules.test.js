import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, afterAll, describe, test, expect } from 'vitest';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getDocs, collection, query, where } from 'firebase/firestore';

const PROJECT_ID = 'transit-stats-rules-test';
const RULES_PATH = resolve(process.cwd(), 'firestore.rules');

let testEnv;

function authedDb(uid, email) {
    return testEnv.authenticatedContext(uid, { email }).firestore();
}

describe('firestore.rules: profile privilege boundaries', () => {
    beforeAll(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                rules: readFileSync(RULES_PATH, 'utf8'),
            },
        });
    });

    beforeEach(async () => {
        if (testEnv) {
            await testEnv.clearFirestore();
        }
    });

    afterAll(async () => {
        if (testEnv) {
            await testEnv.cleanup();
        }
    });

    test('owner can create their own profile with non-privileged defaults', async () => {
        const db = authedDb('user_1', 'user@example.com');
        await assertSucceeds(setDoc(doc(db, 'profiles/user_1'), {
            displayName: 'User',
            defaultAgency: 'TTC',
            isPublic: false,
            isPremium: false,
            isAdmin: false,
        }));
    });

    test('owner cannot create their own profile with premium enabled', async () => {
        const db = authedDb('user_1', 'user@example.com');
        await assertFails(setDoc(doc(db, 'profiles/user_1'), {
            displayName: 'User',
            defaultAgency: 'TTC',
            isPublic: false,
            isPremium: true,
            isAdmin: false,
        }));
    });

    test('owner cannot promote themselves to premium via profile update', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'profiles/user_1'), {
                displayName: 'User',
                defaultAgency: 'TTC',
                isPublic: false,
                isPremium: false,
                isAdmin: false,
            });
        });

        const db = authedDb('user_1', 'user@example.com');
        await assertFails(updateDoc(doc(db, 'profiles/user_1'), { isPremium: true }));
    });

    test('owner cannot promote themselves to admin via profile update', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'profiles/user_1'), {
                displayName: 'User',
                defaultAgency: 'TTC',
                isPublic: false,
                isPremium: false,
                isAdmin: false,
            });
        });

        const db = authedDb('user_1', 'user@example.com');
        await assertFails(updateDoc(doc(db, 'profiles/user_1'), { isAdmin: true }));
    });

    test('admin can update privileged profile fields', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, 'allowedUsers/admin@example.com'), {
                email: 'admin@example.com',
                isAdmin: true,
            });
            await setDoc(doc(db, 'profiles/user_1'), {
                displayName: 'User',
                defaultAgency: 'TTC',
                isPublic: false,
                isPremium: false,
                isAdmin: false,
            });
        });

        const db = authedDb('admin_1', 'admin@example.com');
        await assertSucceeds(updateDoc(doc(db, 'profiles/user_1'), {
            isPremium: true,
            isAdmin: true,
        }));

        const snap = await getDoc(doc(db, 'profiles/user_1'));
        expect(snap.data().isPremium).toBe(true);
        expect(snap.data().isAdmin).toBe(true);
    });

    test('owner can update legitimate profile fields together', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'profiles/user_1'), {
                displayName: 'User',
                defaultAgency: 'TTC',
                isPublic: false,
                isPremium: false,
                isAdmin: false,
            });
        });

        const db = authedDb('user_1', 'user@example.com');
        await assertSucceeds(updateDoc(doc(db, 'profiles/user_1'), {
            displayName: 'New Name',
            defaultAgency: 'GO',
            isPublic: true,
            betaFeatures: { rocket: true },
            updatedAt: new Date(),
        }));
    });

    test('owner cannot write an unlisted field via profile update', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'profiles/user_1'), {
                displayName: 'User',
                defaultAgency: 'TTC',
                isPublic: false,
                isPremium: false,
                isAdmin: false,
            });
        });

        const db = authedDb('user_1', 'user@example.com');
        await assertFails(updateDoc(doc(db, 'profiles/user_1'), {
            secretRole: 'superuser',
        }));
    });
});

describe('firestore.rules: trips are never publicly readable', () => {
    beforeAll(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                rules: readFileSync(RULES_PATH, 'utf8'),
            },
        });
    });

    beforeEach(async () => {
        if (testEnv) {
            await testEnv.clearFirestore();
        }
    });

    afterAll(async () => {
        if (testEnv) {
            await testEnv.cleanup();
        }
    });

    // Regression test for the Public Profile trip data exposure (see INCIDENTS.md,
    // July 2026): the trips rule once granted read on the *entire* document when
    // isPublic was true, leaking userId/route/stop names/timestamps. Trip data must
    // only ever reach a public profile page through the publicProfile Cloud Function
    // (Admin SDK, aggregate fields only) — never a direct client-side Firestore read.
    test('unauthenticated client cannot read a trip doc, even when isPublic is true', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'trips/trip_1'), {
                userId: 'user_1',
                isPublic: true,
                route: '510',
                startStopName: 'Spadina Station',
                endStopName: 'Union Station',
            });
        });

        const anonDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(anonDb, 'trips/trip_1')));
        await assertFails(getDocs(query(collection(anonDb, 'trips'), where('isPublic', '==', true))));
    });

    test('a different authenticated user cannot read a trip doc, even when isPublic is true', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'trips/trip_1'), {
                userId: 'user_1',
                isPublic: true,
                route: '510',
            });
        });

        const otherDb = authedDb('user_2', 'other@example.com');
        await assertFails(getDoc(doc(otherDb, 'trips/trip_1')));
    });

    test('the owner can still read their own trip', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), 'trips/trip_1'), {
                userId: 'user_1',
                isPublic: true,
                route: '510',
            });
        });

        const ownerDb = authedDb('user_1', 'user@example.com');
        await assertSucceeds(getDoc(doc(ownerDb, 'trips/trip_1')));
    });
});
