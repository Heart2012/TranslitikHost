const { Telegraf, Markup } = require('telegraf');
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required');
}

if (!DOMAIN) {
  throw new Error('DOMAIN is required');
}

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err, ctx) => {
  console.error(
    `Bot error ${ctx?.update?.update_id}:`,
    err
  );
});

const userSettings = new Map();

const MAX_VARIANTS = 50;
const MAX_USERNAME_LENGTH = 32;
const UA_MARK = '🔅';
const UKRAINIAN_LETTERS = new Set([
  'і',
  'ї',
  'є',
  'ґ'
]);

const translitMap = {
  'а':'a',
  'б':'b',
  'в':'v',
  'г':'g',
  'ґ':'g',
  'д':'d',
  'е':'e',
  'є':'ye',
  'ё':'e',
  'ж':'zh',
  'з':'z',
  'и':'i',
  'і':'i',
  'ї':'yi',
  'й':'y',
  'к':'k',
  'л':'l',
  'м':'m',
  'н':'n',
  'о':'o',
  'п':'p',
  'р':'r',
  'с':'s',
  'т':'t',
  'у':'u',
  'ф':'f',
  'х':'kh',
  'ц':'ts',
  'ч':'ch',
  'ш':'sh',
  'щ':'shch',
  'ы':'y',
  'э':'e',
  'ю':'yu',
  'я':'ya',
  'ь':'',
  'ъ':'',
  '’':'',
  '\'':''
};

function getKeyboard() {
  return Markup.keyboard([
    ['➕ bot', '🚫 bot']
  ])
    .resize()
    .persistent();
}

function limitVariants(arr) {
  return arr.length > MAX_VARIANTS
    ? arr.slice(0, MAX_VARIANTS)
    : arr;
}

function escapeHtml(text) {
  return text
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function getUkrainianLetters(text) {
  const found = new Set();

  for (const ch of text.toLowerCase()) {
    if (UKRAINIAN_LETTERS.has(ch)) {
      found.add(ch);
    }
  }

  return [...found];
}

function normalizeUsername(username) {
  return username
    .replace(/[^a-z0-9_]/gi,'_')
    .replace(/_+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function toUsernameTitleCase(username) {
  return username.replace(
    /(^|_)([a-z])/g,
    (_, sep, letter) =>
      sep + letter.toUpperCase()
  );
}

function getUkrainianWarning(letters) {
  if (!letters.length) return '';

  return `⚠️ UA-символы: ${letters
    .map(v => v.toUpperCase())
    .join(', ')} → ${UA_MARK}`;
}

function splitTasks(text) {
  return text
    .replace(/Новини(?=[А-ЯІЇЄҐ])/g,'Новини\n')
    .replace(/Лева(?=[А-ЯІЇЄҐ])/g,'Лева\n')
    .replace(/•\s*Новини/gi,'• Новини\n')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
}

function toTitleCase(text) {
  return text.replace(
    /(^|[\s_.\-:;,/\\|•]+)([а-яіїєґa-z])/giu,
    (_, sep, letter) =>
      sep + letter.toUpperCase()
  );
}

function checkUsernameOnTelegramWeb(username) {

  return new Promise((resolve) => {

    let settled = false;

    const done = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = https.get(
      `https://t.me/${encodeURIComponent(username)}`,
      (res) => {

        const location =
          res.headers.location || '';

        if (
          [301,302,303,307,308]
            .includes(res.statusCode)
        ) {
          done(
            location.includes('telegram.org')
              ? '✅ вільно'
              : null
          );
          res.resume();
          return;
        }

        let html = '';

        res.setEncoding('utf8');

        res.on('data', (chunk) => {

          html += chunk;

          if (html.length > 50000) {
            res.destroy();
            done(null);
          }
        });

        res.on('end', () => {

          const isProfilePage =
            res.statusCode === 200 &&
            /tgme_page_title/i
              .test(html);

          done(
            isProfilePage
              ? '❌ зайнято'
              : null
          );
        });

        res.on(
          'error',
          () => done(null)
        );
      }
    );

    req.setTimeout(4000, () => {
      req.destroy();
      done(null);
    });

    req.on(
      'error',
      () => done(null)
    );
  });
}

async function checkUsernameAvailability(username) {

  const web =
    await checkUsernameOnTelegramWeb(
      username
    );

  if (web) {
    return web;
  }

  try {

    await bot.telegram.getChat(
      `@${username}`
    );

    return '❌ зайнято';

  } catch (err) {

    const desc =
      err?.response?.description ||
      err?.message ||
      '';

    if (
      /chat not found/i.test(desc)
    ) {
      return '✅ вільно';
    }

    return '?';
  }
}

function telegramTranslit(text) {

  let lower =
    text.trim().toLowerCase();

  lower = lower.replace(
    /[|•\-:;,/\\]+/g,
    ' '
  );

  let variants = [
    {
      value:'',
      display:''
    }
  ];

  for (
    let i=0;
    i<lower.length;
    i++
  ) {

    const ch = lower[i];

    if (/\s/.test(ch)) {

      variants =
        limitVariants(
          variants.map(v => ({
            value:
              v.value + '_',
            display:
              v.display + '_'
          }))
        );

      continue;
    }

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          translitMap,
          ch
        )
    ) {

      const value =
        translitMap[ch];

      variants =
        limitVariants(
          variants.map(v => ({
            value:
              v.value + value,
            display:
              v.display + value
          }))
        );

      continue;
    }

    if (/[a-z0-9]/.test(ch)) {

      variants =
        limitVariants(
          variants.map(v => ({
            value:
              v.value + ch,
            display:
              v.display + ch
          }))
        );
    }
  }

  variants =
    variants.map(v => ({
      value:
        normalizeUsername(
          v.value
        ),
      display:
        normalizeUsername(
          v.display
        )
    }));

  return {
    variants:
      variants.map(v => v.value),
    displayVariants:
      variants.map(v => v.display)
  };
}

const commands = [
  {
    command:'start',
    description:'старт'
  },
  {
    command:'bot',
    description:'+ bot'
  },
  {
    command:'nobot',
    description:'без bot'
  }
];

bot.start((ctx) => {

  const withBot =
    userSettings
      .get(ctx.from.id)
      ?.withBot || false;

  ctx.reply(
    withBot
      ? '✅ + bot'
      : '🚫 - bot',
    getKeyboard()
  );
});

bot.command(
  'bot',
  (ctx) => {

    userSettings.set(
      ctx.from.id,
      {
        withBot:true
      }
    );

    ctx.reply(
      '✅ bot',
      getKeyboard()
    );
  }
);

bot.command(
  'nobot',
  (ctx) => {

    userSettings.set(
      ctx.from.id,
      {
        withBot:false
      }
    );

    ctx.reply(
      '🚫 bot',
      getKeyboard()
    );
  }
);

bot.hears(
  '➕ bot',
  (ctx) => {

    userSettings.set(
      ctx.from.id,
      {
        withBot:true
      }
    );

    ctx.reply(
      '✅ bot',
      getKeyboard()
    );
  }
);

bot.hears(
  '🚫 bot',
  (ctx) => {

    userSettings.set(
      ctx.from.id,
      {
        withBot:false
      }
    );

    ctx.reply(
      '🚫 bot',
      getKeyboard()
    );
  }
);

bot.on(
  'text',
  async (ctx) => {

    try {

      const wait =
        await ctx.reply(
          '⏳ Перевіряю...',
          getKeyboard()
        );

      const text =
        ctx.message.text.trim();

      const lines =
        splitTasks(text);

      const withBot =
        userSettings
          .get(ctx.from.id)
          ?.withBot || false;

      let finalMsg = '';

      for (
        const rawLine
        of lines
      ) {

        const line =
          toTitleCase(
            rawLine
          );

        const result =
          telegramTranslit(
            line
          );

        finalMsg +=
          `<u>${escapeHtml(line)}</u>\n`;

        const checks =
          await Promise.all(

            result.variants
              .map(
                async (
                  v,
                  i
                ) => {

                  const username =
                    withBot
                      ? `${toUsernameTitleCase(v)}bot`
                      : toUsernameTitleCase(v);

                  const status =
                    await checkUsernameAvailability(
                      username
                    );

                  return `@${username} | ${status}`;
                }
              )
          );

        finalMsg +=
          checks.join(
            '\n'
          ) + '\n\n';
      }

      await ctx.telegram
        .deleteMessage(
          ctx.chat.id,
          wait.message_id
        );

      await ctx.reply(
        finalMsg.trim(),
        {
          parse_mode:
            'HTML',
          ...getKeyboard()
        }
      );

    } catch (err) {

      console.error(
        err
      );

      try {
        await ctx.reply(
          '⚠️ Помилка'
        );
      } catch {}
    }
  }
);

async function startBot() {

  const webhookPath =
    `/bot${BOT_TOKEN}`;

  const webhookUrl =
    `https://${DOMAIN}${webhookPath}`;

  await bot.telegram
    .setMyCommands(
      commands
    );

  await bot.telegram
    .setWebhook(
      webhookUrl
    );

  bot.startWebhook(
    webhookPath,
    null,
    PORT
  );

  console.log(
    'Webhook started:',
    webhookUrl
  );
}

startBot()
  .catch(err => {

    console.error(
      'Start error:',
      err
    );

    process.exit(1);
  });

process.once(
  'SIGINT',
  () => bot.stop('SIGINT')
);

process.once(
  'SIGTERM',
  () => bot.stop('SIGTERM')
);
