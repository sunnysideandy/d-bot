const {getMembersFromDatabase} = require("../controllers/members.js");

module.exports = {
    name: "getmembers",
    usage: "",
    description: "Gets all members from the database, adds both discord nickname and in game name",
    async execute(message, args) {
        let waitingMessage;

        try {
            // Send a "in progress" message. Ignore warning below. That's not true
            waitingMessage = await message.channel.send("This may take a few moments\nWorking on it...");

            await getMembersFromDatabase(message);
        } catch (e) {
            message.channel.send("Something went wrong\n" + e.message);
        }

        // remove "in progress" message
        await waitingMessage.delete();
    },
};
