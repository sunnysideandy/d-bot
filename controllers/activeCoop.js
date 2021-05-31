const {getCoopStatus} = require("./coopStatus.js");
const {getMatchingContract} = require("./matchingContract.js");

const {getActiveCoopsMessage} = require("../messageGenerators/activeCoopsMessage.js");
const {getContractNotFoundMessage} = require("../messageGenerators/contractNotFoundMessage.js");
const {getCoopExistsInActiveCoopsMessage} = require("../messageGenerators/coopExistsInActiveCoopsMessage.js");

exports.getActiveCoops = async (client) => {
    // get all messages from the "active-coop" channel
    let activeCoops = [];
    await client.channels.cache.get(process.env.ACTIVE_COOP_CHANNEL_ID).messages.fetch({limit: 10})
        .then(messages => {
            messages.forEach(m => {
                // ignore messages without embeds
                if (m.embeds.length === 0) return;
                const contractName = m.embeds[0].title;
                // the contract id is in brackets in the description
                const contractId = m.embeds[0].description.split("(").pop().split(")")[0];
                // the coopCodes are delimited by " in the fields names
                const coopCodes = m.embeds[0].fields.map(field => field.name.split('"')[1]);
                // the max coop size is in the footer
                const maxCoopSize = m.embeds[0].footer.text.split(" ").pop();

                activeCoops.push({m, contractName, contractId, coopCodes, maxCoopSize});
            })
        });
    return activeCoops;
}

exports.addActiveCoop = async (message, contractId, coopCode, activeCoops) => {
    // check, if the sent contract already exists in our list
    const existingContractMessage = activeCoops.find(coop => coop.contractId === contractId);
    if (existingContractMessage) {
        // if coop already exists, send message about it and exit command
        if (existingContractMessage.coopCodes.includes(coopCode)) {
            return getCoopExistsInActiveCoopsMessage(contractId, coopCode);
        }
        // add new coop to coopCodes
        const coopCodes = existingContractMessage.coopCodes.concat([coopCode]);
        // update existing message by creating new Content and exit command
        await existingContractMessage.m.edit({
            embed:
                getActiveCoopsMessage(
                    existingContractMessage.contractName,
                    existingContractMessage.contractId,
                    coopCodes,
                    existingContractMessage.maxCoopSize,
                    null
                )
        });

        return "Coop added";
    }

    // get the contract information
    const contract = await getMatchingContract(contractId);
    // if no contract is found, return a message to the channel and exit the command
    if (!contract) {
        return getContractNotFoundMessage(contractId);
    }
    // send coop information to the channel
    message.client.channels.cache.get(process.env.ACTIVE_COOP_CHANNEL_ID)
        .send({embed: getActiveCoopsMessage(contract.name, contractId, [coopCode],contract.maxCoopSize)});

    return ("Contract and Coop added");
}

exports.removeActiveCoop = async (contractId, coopCode, activeCoops) => {
    // check for the existence of the contract in our list
    const existingContractMessage = activeCoops.find(coop => coop.contractId === contractId);
    if (existingContractMessage) {
        // if coop already exists, send message about it and exit command
        if (existingContractMessage.coopCodes.includes(coopCode)) {
            // remove coop from the active coop object
            existingContractMessage.coopCodes = existingContractMessage.coopCodes.filter(cc => cc !== coopCode);
            // remove contract from the channel, if the coop was the last one
            if (existingContractMessage.coopCodes.length === 0) {
                existingContractMessage.m.delete();
                return "Coop and Contract removed";
            }

            await existingContractMessage.m.edit({
                embed:
                    getActiveCoopsMessage(
                        existingContractMessage.contractName,
                        existingContractMessage.contractId,
                        existingContractMessage.coopCodes,
                        existingContractMessage.maxCoopSize,
                        null
                    )
            });
            // confirm the action in the bot channel
            return "Coop removed";
        }

        // notify bot channel that coop was not there
        return `Coop code ${coopCode} not found for contract ${contractId}`;
    }
    return `Contract ${contractId} not found in #active-coop channel`;
}

exports.updateActiveCoops = async (activeCoops) => {
    for (const activeContract of activeCoops) {
        let coopSizes = [];
        for (const coopCode of activeContract.coopCodes) {
            // get coop status
            const coopStatus = await getCoopStatus(activeContract.contractId, coopCode);
            if (!coopStatus){
                coopSizes.push("Coop does not exist");
            } else {
                coopSizes.push(coopStatus.contributors.length);
            }
        }

        await activeContract.m.edit({
            embed:
                getActiveCoopsMessage(
                    activeContract.contractName,
                    activeContract.contractId,
                    activeContract.coopCodes,
                    activeContract.maxCoopSize,
                    coopSizes
                )
        });
    }
}
