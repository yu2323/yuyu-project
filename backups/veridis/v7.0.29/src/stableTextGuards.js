/**
 * v7.0.28: conservative final-text guards for regressions that AI rules can re-introduce.
 * These helpers are intentionally pure so they can be regression-tested without the ST host.
 */

function transformOutsideDialogue(sourceText, transform) {
    const text = String(sourceText ?? '');
    if (!text) return text;
    const dialogueRegex = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"\r\n]*"/gu;
    let output = '';
    let cursor = 0;
    for (const match of text.matchAll(dialogueRegex)) {
        const start = Number(match.index) || 0;
        output += transform(text.slice(cursor, start));
        output += match[0];
        cursor = start + match[0].length;
    }
    output += transform(text.slice(cursor));
    return output;
}

/**
 * Collapse obvious narration-only duplication artifacts that older exact A+A cleanup misses.
 * - “是是” -> “是”, but do not touch the idiom “是是非非”.
 * - “X + 彻底/更加/再次... + X” -> keep the strengthened latter copy.
 * Dialogue is preserved byte-for-byte so stutters and deliberate repetitions survive.
 */
export function cleanupNarrativeNearDuplication(sourceText) {
    return transformOutsideDialogue(sourceText, (span) => {
        let output = span.replace(/是是(?!非非)/gu, '是');
        const modifierInterruptedRepeat = /([\p{Script=Han}]{4,24})(彻底|更加|愈发|越发|再次|再度|依旧|仍然|更为|几乎|已经|早已)\1/gu;
        output = output.replace(modifierInterruptedRepeat, (full, unit, modifier) => {
            const token = String(unit || '');
            if (token.length < 6 && !/[的地与和]/u.test(token)) return full;
            return `${modifier}${token}`;
        });
        return output;
    });
}

/**
 * v7.0.29: collapse an accidental narration prefix replay across adjacent paragraphs.
 * Typical AI write-back artifact:
 *   A。
 *   A。B...
 * or
 *   A。
 *   A，B...
 * Keep the longer second sentence by removing only the standalone first copy.
 *
 * Safety boundaries:
 * - narration only (quoted dialogue is preserved byte-for-byte)
 * - adjacent paragraphs only
 * - exact prefix only, 12~120 chars
 * - no fuzzy/similarity matching
 */
export function cleanupNarrativePrefixDuplication(sourceText) {
    return transformOutsideDialogue(sourceText, (span) => {
        let output = String(span || '');
        if (!output) return output;

        const repeatedParagraphPrefix = /(^|\r?\n)([ \t]*)([^。！？!?\r\n]{12,120}?)([。！？!?])([ \t]*(?:\r?\n)[ \t]*(?:\r?\n[ \t]*)?)\3(?=[，,。！？!?；;：:])/gmu;

        for (let pass = 0; pass < 3; pass += 1) {
            const next = output.replace(repeatedParagraphPrefix, '$1$2$3');
            if (next === output) break;
            output = next;
        }
        return output;
    });
}

const externalBodySoftMeatPattern = /(大腿(?:内侧|外侧)?|腿侧|腿根|腰侧|臀部|胸部|小腹|下腹|肩头|手臂)(?:上|处|的)?(?:那片|这片|一片|那块|这块)?(?:柔软的肉|软肉|嫩肉)/gu;
const bodyTouchAnchorPattern = /(?:娇嫩|薄嫩|细嫩|柔嫩|冷白|白皙|光滑|细腻|手掌|掌心|指腹|指尖|按|压|碾|揉|捏|抓|抚|推挤|变形|凹陷|压痕|泛红|充血|大腿|腿侧|臀|腰|胸|肩|腹|胯|阴唇|阴蒂|阴部)/u;
const injuryAnchorPattern = /(?:皮肉伤|皮肉之苦|刀|剑|刃|割|划|砍|撕裂|裂开|伤口|创口|烧伤|烫伤|流血|鲜血|血肉|剥开)/u;
const internalSexualAnchorPattern = /(?:阴道|阴核|穴口|小穴|逼洞|肉洞|宫颈)/u;

function cleanupBodyMeatSentence(sentence) {
    let output = String(sentence || '');
    if (!output) return output;

    output = output
        .replace(externalBodySoftMeatPattern, '$1')
        .replace(/大腿肉/gu, '大腿')
        .replace(/腿肉/gu, '腿侧')
        .replace(/臀肉/gu, '臀部')
        .replace(/胸肉/gu, '胸部');

    if (output.includes('皮肉')
        && bodyTouchAnchorPattern.test(output)
        && !injuryAnchorPattern.test(output)
        && !internalSexualAnchorPattern.test(output)) {
        output = output.replace(/皮肉/gu, '肌肤');
    }
    return output;
}

export function cleanupHumanMeatObjectificationResidue(sourceText) {
    return transformOutsideDialogue(sourceText, (span) => span.replace(
        /[^。！？!?\r\n]+(?:[。！？!?]+|$)/gu,
        (sentence) => cleanupBodyMeatSentence(sentence)
    ));
}

export function applyStableFinalTextGuards(sourceText) {
    let output = cleanupNarrativeNearDuplication(sourceText);
    output = cleanupNarrativePrefixDuplication(output);
    output = cleanupHumanMeatObjectificationResidue(output);
    return output;
}
