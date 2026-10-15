// 몰래 심어진 프로그램(서비스·예약 작업 등 지속성, T1543·T1053) 대응(연결) 모듈입니다.
// decide.mjs 의 판단 결과 가운데 '차단 후보(block)'만 골라
// ZTNA 판정기가 쓰는 '거부 규칙' 목록으로 넣고, 알림을 xdr/alerts.log 에 한 줄씩 쌓습니다.
//
// 역할 분리:
//  - decide.mjs 는 판단만 합니다(파일 쓰기·판정기 연결 없음). 여기서 건드리지 않습니다.
//  - src/decider.mjs 의 기존 규칙도 고치지 않습니다. 이 파일은 그 바깥의 '연결(bridge)'입니다.
//
// 거부 규칙은 출발 주소(srcip)를 기준으로 만듭니다. 판정기 요청 계약(aleph.decision.v1)에는
// 출발 IP 항목이 없으므로, 계약에 없는 필드를 지어내 요청에 끼우지 않습니다. 대신
// 릴레이/엔진이 접근 앞단에서 쓰는 주소 거부 규칙으로 내보냅니다.
//
// 정상 사용자 보호:
//  - 규칙은 오직 block 후보에서만 만들어집니다. alert·record 는 규칙이 되지 않습니다.
//  - 같은 묶음에서 로그인한 정상 사용자(srcuser 가 있고 record 로 판단된 경보)가 쓴 주소는
//    여러 사람이 함께 쓰는 주소일 수 있으므로 규칙을 만들지 않고 알림에만 남깁니다.
//  - 주소 모양이 올바르지 않으면 규칙을 만들지 않습니다.
//  - 알림 로그에는 주소·판정 결과만 적고, 요청 주소(url)·머리글 값·구문은 적지 않습니다.

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'persistence';
const LOG_PATH = new URL('../alerts.log', import.meta.url);
const FIXTURE_PATH = new URL('../fixtures/persistence.json', import.meta.url);
const DEFAULT_TTL_SECONDS = 60 * 60; // 거부 규칙 기본 만료: 1시간

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;
const validIp = (v) => typeof v === 'string' && (IPV4.test(v) || (v.includes(':') && IPV6.test(v)));

// 판정기·정상 사용자 쪽 주소: 로그인한 정상 사용자가 쓴 것으로 확인된 주소 집합
function normalUserAddresses(alerts, decided) {
  const set = new Set();
  alerts.forEach((alert, i) => {
    const user = alert?.data?.srcuser;
    if (typeof user === 'string' && user && decided[i].action === 'record') set.add(alert?.data?.srcip);
  });
  return set;
}

// 차단 후보(block)만 모아 주소별 거부 규칙으로 만듭니다.
// 규칙에는 만료 시각(expiresAt)과 근거 경보 번호(evidenceAlertIds)를 붙입니다.
export function planDenyRules(alerts, { now = new Date(), ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const list = Array.isArray(alerts) ? alerts : [];
  const decided = list.map((alert) => decide(alert));
  const protectedAddrs = normalUserAddresses(list, decided);
  const decidedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const bySrc = new Map();

  list.forEach((alert, i) => {
    const result = decided[i];
    if (result.action !== 'block') return; // 차단 후보만 규칙으로
    const srcip = alert?.data?.srcip;
    if (!validIp(srcip) || protectedAddrs.has(srcip)) return; // 주소가 없거나 정상 사용자 주소면 규칙 없음
    const id = alert?.id;

    if (!bySrc.has(srcip)) {
      bySrc.set(srcip, {
        ruleId: `${MODULE_KEY}.deny.${srcip}`,
        decision: 'deny',
        srcip,
        reason: result.reason,
        confidence: result.confidence,
        evidenceAlertIds: [],
        decidedAt,
        expiresAt,
      });
    }
    const rule = bySrc.get(srcip);
    if (id && !rule.evidenceAlertIds.includes(id)) rule.evidenceAlertIds.push(id);
    // 같은 주소의 여러 경보 중 가장 확신도 높은 근거를 대표로 남김
    if (result.confidence > rule.confidence) {
      rule.confidence = result.confidence;
      rule.reason = result.reason;
    }
  });

  // 근거 경보 번호가 없는 규칙은 내보내지 않습니다(근거 없는 차단 금지).
  return [...bySrc.values()].filter((rule) => rule.evidenceAlertIds.length > 0);
}

// 알림을 xdr/alerts.log 에 한 줄씩 덧붙입니다(경보마다 한 줄).
export function logAlerts(alerts, { now = new Date(), logPath = LOG_PATH } = {}) {
  const lines = [];
  for (const alert of Array.isArray(alerts) ? alerts : []) {
    const r = decide(alert);
    const srcip = validIp(alert?.data?.srcip) ? alert.data.srcip : '-';
    const id = typeof alert?.id === 'string' ? alert.id.slice(0, 40) : '-';
    lines.push(
      `${now.toISOString()} module=${MODULE_KEY} alert=${id} srcip=${srcip} action=${r.action} confidence=${r.confidence} reason="${r.reason}"`,
    );
  }
  if (lines.length) appendFileSync(logPath, lines.join('\n') + '\n');
  return lines;
}

// 주소가 지금(now) 유효한 거부 규칙에 걸려 있는지 확인합니다(만료된 규칙은 통과).
export function isBlocked(srcip, rules, now = new Date()) {
  const t = now.getTime();
  return (rules || []).find(
    (rule) => rule.srcip === srcip && rule.decision === 'deny' && new Date(rule.expiresAt).getTime() > t,
  ) || null;
}

// 연결 실행: 경보를 받아 로그를 쌓고 거부 규칙 목록을 돌려줍니다.
export function respond(alerts, opts = {}) {
  const now = opts.now ?? new Date();
  logAlerts(alerts, { ...opts, now });
  const rules = planDenyRules(alerts, { ...opts, now });
  return { rules, generatedAt: now.toISOString() };
}

// node 로 직접 실행하면: 시험 경보를 흘려 거부 규칙을 만들고,
// 각 경보의 주소를 요청처럼 다시 넣어 '명확한 공격만 막히고 정상은 통과'하는지 확인합니다.
function main() {
  const { alerts } = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const now = new Date();
  const { rules } = respond(alerts, { now });

  console.log('=== 만들어진 거부 규칙 (block 후보만) ===');
  for (const rule of rules) {
    console.log(`${rule.ruleId} | 만료 ${rule.expiresAt} | 근거 경보 ${rule.evidenceAlertIds.join(',')} | ${rule.reason}`);
  }

  // 경보마다 판단 결과(block 여부)를 기준으로, 그 주소가 막혔는지 확인합니다.
  console.log('\n=== 시험 요청 재주입 (경보별 통과/차단) ===');
  let wrongBlocked = 0;
  let missedAttack = 0;
  for (const alert of alerts) {
    const attack = decide(alert).action === 'block';
    const denied = !!isBlocked(alert.data?.srcip, rules, now);
    console.log(`${alert.id} ${alert.data?.srcip} -> ${denied ? '차단' : '통과'}${denied === attack ? '' : '  <= 예상과 다름!'}`);
    if (denied && !attack) wrongBlocked++; // 공격이 아닌데 막힘
    if (!denied && attack) missedAttack++; // 공격인데 안 막힘
  }

  const attackCount = alerts.filter((a) => decide(a).action === 'block').length;
  const ok = wrongBlocked === 0 && missedAttack === 0;
  console.log(
    `\n거부 규칙 ${rules.length}개 · 차단 후보 경보 ${attackCount}건 전부 차단, 공격이 아닌 경보 오차단 ${wrongBlocked}건, 공격 누락 ${missedAttack}건 -> ${ok ? 'OK' : '실패'}`,
  );
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
