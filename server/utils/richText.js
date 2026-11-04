import sanitizeHtml from 'sanitize-html';

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i, /^[a-z]{3,20}$/i];

/**
 * 전자결재 본문 편집기에서 쓰는 서식만 남깁니다. 링크·이미지·스크립트·이벤트 속성은 모두 지웁니다.
 * 허용하지 않는 태그는 글자만 남기고 태그를 버립니다.
 */
const OPTIONS = {
  allowedTags: [
    'p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    '*': ['style'],
    td: ['style', 'colspan', 'rowspan'],
    th: ['style', 'colspan', 'rowspan'],
  },
  allowedStyles: {
    '*': {
      color: COLOR,
      'background-color': COLOR,
      'font-size': [/^\d{1,2}(\.\d)?(pt|px)$/, /^(xx?x?-)?(small|large)$/, /^medium$/],
      'font-family': [/^[\w\s가-힣'",-]{1,80}$/],
      'font-weight': [/^(bold|normal|[1-9]00)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^[a-z\s-]{1,40}$/],
      'text-decoration-line': [/^[a-z\s-]{1,40}$/],
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: [],
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
};

export function sanitizeRichText(html) {
  return sanitizeHtml(String(html ?? ''), OPTIONS).trim();
}

/** 글자만 남긴 본문 (빈 본문 확인용) */
export function richTextPlain(html) {
  return sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;|\u00a0/g, ' ')
    .trim();
}
