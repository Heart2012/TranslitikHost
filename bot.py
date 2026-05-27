import logging
import os
import re
from aiogram import Bot, Dispatcher, types
from aiogram.utils.executor import start_webhook
from aiohttp import web

# 🔐 Токен і URL з Render → Environment BOT_TOKEN
BOT_TOKEN = os.getenv("8638610424:AAEHB7HmoPAwyOhwFbohff1aApOAtJfySFg")
WEBAPP_HOST = "0.0.0.0"
WEBAPP_PORT = int(os.getenv("PORT", 10000))
APP_URL = os.getenv("RENDER_EXTERNAL_URL")  # Автоматично задається Render

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)

# 🗺️ Транслітерація
translit_map = {
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh',
    'з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n',
    'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
    'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
    'А':'a','Б':'b','В':'v','Г':'h','Ґ':'g','Д':'d','Е':'e','Є':'ie','Ж':'zh',
    'З':'z','И':'y','І':'i','Ї':'i','Й':'i','К':'k','Л':'l','М':'m','Н':'n',
    'О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u','Ф':'f','Х':'kh','Ц':'ts',
    'Ч':'ch','Ш':'sh','Щ':'shch','Ь':'','Ю':'iu','Я':'ia'
}

def transliterate(text):
    result = "".join(translit_map.get(ch, ch) for ch in text)
    result = re.sub(r'[^a-zA-Z0-9]+', '_', result)
    result = re.sub(r'_+', '_', result).strip('_')
    return result.lower()

@dp.message_handler(commands=['start'])
async def start(msg: types.Message):
    await msg.answer("👋 Привіт! Надішли слово українською — я зроблю транслітерацію як у пошуку Telegram.\n\nНаприклад:\nновини → noviny\nкиївські новини → kyivski_novyny")

@dp.message_handler()
async def translit_message(msg: types.Message):
    text = msg.text.strip()
    if not text:
        await msg.answer("🤔 Введи текст для транслітерації.")
        return
    await msg.answer(transliterate(text))

async def on_startup(dp):
    webhook_url = f"{APP_URL}/webhook/{BOT_TOKEN}"
    await bot.set_webhook(webhook_url)
    logging.info(f"Webhook set to {webhook_url}")

async def on_shutdown(dp):
    logging.warning('Shutting down...')
    await bot.delete_webhook()
    await dp.storage.close()
    await dp.storage.wait_closed()
    logging.warning('Bye!')

if __name__ == '__main__':
    start_webhook(
        dispatcher=dp,
        webhook_path=f"/webhook/{BOT_TOKEN}",
        on_startup=on_startup,
        on_shutdown=on_shutdown,
        skip_updates=True,
        host=WEBAPP_HOST,
        port=WEBAPP_PORT,
    )
