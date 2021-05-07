const Discord = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const client = new Discord.Client();
client.commands = new Discord.Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

function fillUsers(args, userClient) {
    for (let i = 0; i < args.length; i++) {
        const userid = args[i].match(/^<@!?(\d+)>$/);
        if (!userid) continue;
        args[i] = userClient.users.cache.get(userid[1]);
    }
    return args;
}

function getCommand(message) {
    if (message.author.bot) return;
    const args = message.content
        .trim()
        // escape using quotes
        .split('"')
        // space delimit (unescaped) params
        .map((substr, idx) => {
            return idx % 2 == 0 ? substr.split(/\s+/) : substr;
        })
        .flat()
        // ignore empty params
        .filter(arg => arg);
    if (!args) return;
    fillUsers(args, message.client);
    let command = args.shift();
    if (command == message.client.user) {
        command = args.shift();
    // TODO: support prefixes lol
    // } else if (command.startswithprefix) {
    }
    else {
        return;
    }
    return { command: command, args: args };
}

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

client.once('ready', () => {
    client.on('message', message => {
        const { command, args } = getCommand(message) || {};
        if (!client.commands.has(command)) return;
        try {
            client.commands.get(command).execute(message, args);
        }
        catch (error) {
            console.error(error);
            message.reply('There was an error trying to execute that command!');
        }
    });
});

// Grab client token from environment
client.login(process.env.TOKEN);
