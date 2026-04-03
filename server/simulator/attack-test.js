#!/usr/bin/env node
/**
 * ACL Attack Test — verifies whether a pre-activation device can publish
 * to ANOTHER device's config topic (it should NOT be able to).
 *
 * This script connects as a fake IMEI with PRE_ACTIVATION_SECRET and attempts
 * to publish a config_update to a victim IMEI's config topic.
 *
 * Usage:
 *   node attack-test.js --attacker-imei 999999999999999 --victim-imei 350938241548715 \
 *     --host 20.198.101.175 --port 8883 --tls --pre-pass <PRE_ACTIVATION_SECRET>
 *
 * Expected result: ALL publish/subscribe attempts to victim topics should be DENIED.
 * If any succeed, there is an ACL misconfiguration on the EMQX broker.
 */

import mqtt from 'mqtt';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const ATTACKER_IMEI = args['attacker-imei'] || '999999999999999';
const VICTIM_IMEI   = args['victim-imei']   || '350938241548715';
const HOST          = args['host']           || '127.0.0.1';
const PORT          = parseInt(args['port']  || '8883');
const TLS           = args['tls'] === true || args['tls'] === 'true';
const NO_VERIFY     = args['no-verify'] === true || args['no-verify'] === 'true';
const PRE_PASS      = args['pre-pass'] || process.env.PRE_ACTIVATION_SECRET || '';

if (!PRE_PASS) {
  console.error('Error: --pre-pass or PRE_ACTIVATION_SECRET env var required');
  process.exit(1);
}

const results = [];

function logResult(test, action, topic, result) {
  const icon = result === 'ALLOWED' ? '🚨 VULNERABILITY' : '✅ BLOCKED';
  console.log(`${icon}  [${test}] ${action} ${topic} → ${result}`);
  results.push({ test, action, topic, result });
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  CloudSynk MQTT ACL Attack Test');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Attacker IMEI : ${ATTACKER_IMEI}`);
console.log(`  Victim IMEI   : ${VICTIM_IMEI}`);
console.log(`  Broker        : ${TLS ? 'mqtts' : 'mqtt'}://${HOST}:${PORT}`);
console.log('═══════════════════════════════════════════════════════════\n');

const client = mqtt.connect({
  host:               HOST,
  port:               PORT,
  protocol:           TLS ? 'mqtts' : 'mqtt',
  username:           ATTACKER_IMEI,
  password:           PRE_PASS,
  clientId:           `attack-test-${Date.now()}`,
  clean:              true,
  connectTimeout:     10000,
  rejectUnauthorized: !NO_VERIFY,
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
});

client.on('connect', () => {
  console.log(`Connected as ${ATTACKER_IMEI} (pre-activation credentials)\n`);
  console.log('--- Test 1: Subscribe to VICTIM config topic ---');

  // Test 1: Subscribe to victim's config topic (should be DENIED)
  client.subscribe(`cloudsynk/${VICTIM_IMEI}/config`, { qos: 1 }, (err, granted) => {
    if (err) {
      logResult('T1', 'SUBSCRIBE', `cloudsynk/${VICTIM_IMEI}/config`, 'BLOCKED (error)');
    } else {
      // granted[0].qos === 128 means subscription was denied by broker
      const denied = granted && granted[0] && granted[0].qos === 128;
      logResult('T1', 'SUBSCRIBE', `cloudsynk/${VICTIM_IMEI}/config`,
        denied ? 'BLOCKED (qos=128)' : `ALLOWED (qos=${granted[0]?.qos})`);
    }

    // Test 2: Publish config_update to victim's config topic (should be DENIED)
    console.log('\n--- Test 2: Publish config_update to VICTIM config topic ---');
    const fakeConfig = JSON.stringify({
      type: 'config_update',
      timestamp: new Date().toISOString(),
      Motor_ON_Time_sec: 999,
      _attack_test: true,
    });

    client.publish(`cloudsynk/${VICTIM_IMEI}/config`, fakeConfig, { qos: 1 }, (err) => {
      logResult('T2', 'PUBLISH', `cloudsynk/${VICTIM_IMEI}/config`,
        err ? 'BLOCKED (error)' : 'ALLOWED (no error)');

      // Test 3: Publish to victim's telemetry topic (should be DENIED)
      console.log('\n--- Test 3: Publish to VICTIM telemetry topic ---');
      client.publish(`cloudsynk/${VICTIM_IMEI}/telemetry`, '{"test":true}', { qos: 1 }, (err) => {
        logResult('T3', 'PUBLISH', `cloudsynk/${VICTIM_IMEI}/telemetry`,
          err ? 'BLOCKED (error)' : 'ALLOWED (no error)');

        // Test 4: Subscribe to OWN config topic (should be ALLOWED — this is legitimate)
        console.log('\n--- Test 4: Subscribe to OWN config topic (should be allowed) ---');
        client.subscribe(`cloudsynk/${ATTACKER_IMEI}/config`, { qos: 1 }, (err, granted) => {
          if (err) {
            logResult('T4', 'SUBSCRIBE', `cloudsynk/${ATTACKER_IMEI}/config`, 'BLOCKED (error)');
          } else {
            const denied = granted && granted[0] && granted[0].qos === 128;
            logResult('T4', 'SUBSCRIBE', `cloudsynk/${ATTACKER_IMEI}/config`,
              denied ? 'BLOCKED (qos=128)' : `ALLOWED (qos=${granted[0]?.qos})`);
          }

          // Test 5: Publish to pre-activation topic (should be ALLOWED — this is legitimate)
          console.log('\n--- Test 5: Publish to pre-activation topic (should be allowed) ---');
          client.publish('cloudsynk/pre-activation', JSON.stringify({ IMEI: ATTACKER_IMEI }), { qos: 1 }, (err) => {
            logResult('T5', 'PUBLISH', 'cloudsynk/pre-activation',
              err ? 'BLOCKED (error)' : 'ALLOWED (no error)');

            // Test 6: Subscribe to wildcard (should be DENIED)
            console.log('\n--- Test 6: Subscribe to wildcard cloudsynk/# ---');
            client.subscribe('cloudsynk/#', { qos: 1 }, (err, granted) => {
              if (err) {
                logResult('T6', 'SUBSCRIBE', 'cloudsynk/#', 'BLOCKED (error)');
              } else {
                const denied = granted && granted[0] && granted[0].qos === 128;
                logResult('T6', 'SUBSCRIBE', 'cloudsynk/#',
                  denied ? 'BLOCKED (qos=128)' : `ALLOWED (qos=${granted[0]?.qos})`);
              }

              // Summary
              console.log('\n═══════════════════════════════════════════════════════════');
              console.log('  SUMMARY');
              console.log('═══════════════════════════════════════════════════════════');
              const vulns = results.filter(r => r.result.startsWith('ALLOWED') && !['T4', 'T5'].includes(r.test));
              if (vulns.length > 0) {
                console.log(`\n  🚨 ${vulns.length} VULNERABILITY(IES) FOUND:`);
                vulns.forEach(v => console.log(`     - ${v.test}: ${v.action} ${v.topic}`));
                console.log('\n  The EMQX ACL is NOT properly enforcing topic restrictions.');
                console.log('  Check: EMQX Dashboard → Authorization → Source order & rules');
              } else {
                console.log('\n  ✅ All cross-device access attempts were blocked.');
                console.log('  ACL rules are working correctly.');
              }

              const legitimate = results.filter(r => ['T4', 'T5'].includes(r.test));
              const legitimateBlocked = legitimate.filter(r => !r.result.startsWith('ALLOWED'));
              if (legitimateBlocked.length > 0) {
                console.log(`\n  ⚠️  ${legitimateBlocked.length} legitimate action(s) were also blocked (may indicate overly strict rules).`);
              }

              console.log('\n═══════════════════════════════════════════════════════════');

              client.end();
              process.exit(vulns.length > 0 ? 1 : 0);
            });
          });
        });
      });
    });
  });
});

client.on('close', () => {
  if (results.length === 0) {
    console.error('\nConnection closed before tests completed. Check credentials and broker address.');
  }
});

setTimeout(() => {
  console.error('\nTimeout — broker may be unreachable or connection was rejected.');
  process.exit(2);
}, 30000);
