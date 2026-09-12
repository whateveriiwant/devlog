module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    name: 'custom-emoji-parser',
    parserOpts: {
      headerPattern: /^(.+?):\s(.+)$/,
      headerCorrespondence: ['type', 'subject']
    }
  },
  rules: {
    'type-enum': [
      2,
      'always',
      ['✨ feat', '🐛 fix', '♻️ refactor', '📝 docs', '⚡ perf', '🔧 chore', '🚀 deploy', '🔥 remove', '💄 style', '🧪 test']
    ],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 100]
  }
};
