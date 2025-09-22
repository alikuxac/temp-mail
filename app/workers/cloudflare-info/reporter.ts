<<<<<<< HEAD
<<<<<<< HEAD
import { EmailRoutingRule, getCloudflareApiData, WorkerScript, Zone, KVNamespace, D1Database } from "./api";

async function reportZones() {
    const zonesResponse = await getCloudflareApiData<Zone[]>('/zones', false);
    if (!zonesResponse.success) {
        console.error('Could not fetch domain (zone) information.');
        return [];
    }
    const zones = zonesResponse.result;
=======
import {
    getCloudflareApiData,
    type WorkerScript,
    type D1Database,
    type KVNamespace,
    type Zone,
    type EmailRoutingRule,
} from './api';
=======
import { EmailRoutingRule, getCloudflareApiData, WorkerScript, Zone, KVNamespace, D1Database } from "./api";
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)

async function reportZones() {
    const zonesResponse = await getCloudflareApiData<Zone[]>('/zones', false);
    if (!zonesResponse.success) {
        console.error('Could not fetch domain (zone) information.');
        return [];
    }
    const zones = zonesResponse.result;
<<<<<<< HEAD

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    console.log('\n--- Cloudflare Domains (Zones) ---');
    if (zones.length === 0) {
        console.log('No domains found in this account.');
    } else {
        zones.forEach((zone: Zone) => {
            console.log(`  - Name: ${zone.name}, ID: ${zone.id}, Status: ${zone.status}`);
        });
    }
<<<<<<< HEAD
<<<<<<< HEAD
    return zones;
}

async function reportEmailRouting(zones: Zone[]) {
    if (zones.length === 0) return;
    console.log('\n--- Email Routing Status per Domain ---');
    for (const zone of zones) {
        try {
            const emailRoutingRulesResponse = await getCloudflareApiData<EmailRoutingRule[]>(`/zones/${zone.id}/email/routing/rules`, false);
            if (!emailRoutingRulesResponse.success) {
                console.error(`  Could not fetch email routing rules for ${zone.name}. Ensure your API token has 'Zone:Email:Read' permissions.`);
                continue;
            }
            const emailRoutingRules = emailRoutingRulesResponse.result;
            console.log(`  Domain: ${zone.name}`);
            if (emailRoutingRules.length === 0) {
                console.log(`    No email routing rules found.`);
            } else {
                emailRoutingRules.forEach((rule: EmailRoutingRule) => {
                    console.log(`    - Rule: ${rule.name} (ID: ${rule.id}, Enabled: ${rule.enabled})`);
                });
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function reportWorkers() {
    const workersResponse = await getCloudflareApiData<WorkerScript[]>('/workers/scripts');
=======
=======
    return zones;
}
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)

async function reportEmailRouting(zones: Zone[]) {
    if (zones.length === 0) return;
    console.log('\n--- Email Routing Status per Domain ---');
    for (const zone of zones) {
        try {
            const emailRoutingRulesResponse = await getCloudflareApiData<EmailRoutingRule[]>(`/zones/${zone.id}/email/routing/rules`, false);
            if (!emailRoutingRulesResponse.success) {
                console.error(`  Could not fetch email routing rules for ${zone.name}. Ensure your API token has 'Zone:Email:Read' permissions.`);
                continue;
            }
            const emailRoutingRules = emailRoutingRulesResponse.result;
            console.log(`  Domain: ${zone.name}`);
            if (emailRoutingRules.length === 0) {
                console.log(`    No email routing rules found.`);
            } else {
                emailRoutingRules.forEach((rule: EmailRoutingRule) => {
                    console.log(`    - Rule: ${rule.name} (ID: ${rule.id}, Enabled: ${rule.enabled})`);
                });
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function reportWorkers() {
    const workersResponse = await getCloudflareApiData<WorkerScript[]>('/workers/scripts');
<<<<<<< HEAD

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    if (!workersResponse.success) {
        console.error('Could not fetch Workers information.');
        return;
    }
<<<<<<< HEAD
<<<<<<< HEAD
    const workers = workersResponse.result;
=======

    const workers = workersResponse.result;

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
    const workers = workersResponse.result;
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    console.log('\n--- Cloudflare Workers ---');
    console.log(`Number of Workers deployed: ${workers.length}`);
    workers.forEach((worker: WorkerScript) => {
        console.log(`  - Name: ${worker.id}`);
    });
<<<<<<< HEAD
<<<<<<< HEAD
}

async function reportD1Databases() {
    const d1Response = await getCloudflareApiData<D1Database[]>('/d1/database');
=======
=======
}
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)

async function reportD1Databases() {
    const d1Response = await getCloudflareApiData<D1Database[]>('/d1/database');
<<<<<<< HEAD

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    if (!d1Response.success) {
        console.error('Could not fetch D1 database information.');
        return;
    }
<<<<<<< HEAD
<<<<<<< HEAD
    const d1Databases = d1Response.result;
=======

    const d1Databases = d1Response.result;

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
    const d1Databases = d1Response.result;
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    console.log('\n--- Cloudflare D1 Databases ---');
    if (d1Databases.length === 0) {
        console.log('No D1 databases found.');
    } else {
        d1Databases.forEach((db: D1Database) => {
            console.log(`  - Name: ${db.name}, ID: ${db.uuid}, Created: ${db.created_at}`);
        });
    }
<<<<<<< HEAD
<<<<<<< HEAD
}

async function reportKVNamespaces() {
    const kvResponse = await getCloudflareApiData<KVNamespace[]>('/storage/kv/namespaces');
=======
=======
}
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)

async function reportKVNamespaces() {
    const kvResponse = await getCloudflareApiData<KVNamespace[]>('/storage/kv/namespaces');
<<<<<<< HEAD

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    if (!kvResponse.success) {
        console.error('Could not fetch KV namespace information.');
        return;
    }
<<<<<<< HEAD
<<<<<<< HEAD
    const kvNamespaces = kvResponse.result;
=======

    const kvNamespaces = kvResponse.result;

>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
    const kvNamespaces = kvResponse.result;
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
    console.log('\n--- Cloudflare KV Namespaces ---');
    if (kvNamespaces.length === 0) {
        console.log('No KV namespaces found.');
    } else {
        kvNamespaces.forEach((ns: KVNamespace) => {
            console.log(`  - Title: ${ns.title}, ID: ${ns.id}`);
        });
    }
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
}

export async function report() {
    const zones = await reportZones();
    await reportEmailRouting(zones);
    await reportWorkers();
    await reportD1Databases();
    await reportKVNamespaces();
<<<<<<< HEAD
=======
>>>>>>> b2c1ee7 (chore: Release version 0.1.0)
=======
>>>>>>> 06b7c68 (fixup! chore: Release version 0.1.0)
}