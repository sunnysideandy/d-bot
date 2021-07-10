const {getCoopAssignmentSuggestionMessage} = require("../messageGenerators/coopAssignmentSuggestion.js");
const {getMatchingContract} = require("./matchingContract.js");
const {getAllContractsList} = require("../services/dataAccess/auxbrainApi.js");
const {getPlayerByEiId} = require("../services/auxbrain/player.js");
const {getMembers} = require("../services/dataAccess/database.js");

exports.assignCoopTeams = async (message, contractId) => {
    // throw an error, if no contract id was supplied
    if (!contractId) throw new Error("Please specify the contract id");

    try {
        // get all members
        const members = await getMembers();

        // get player info from auxbrain API
        let updatedMembers = [];
        for (let member of members) {
            const player = await getPlayerByEiId(member.eiId);
            member = Object.assign({}, member.toObject(), {backup: player.backup});
            updatedMembers.push(member);
        }

        // calculate EB for all players
        updatedMembers = updatedMembers.map(member => {
            const soulEggs = member.backup.game.soulEggsD;
            const prophecyEggs = member.backup.game.eggsOfProphecy;
            const earningsBonus = 100 * soulEggs * 1.5 * 1.1 ** prophecyEggs;
            return Object.assign({}, member, {earningsBonus});
        });

        // todo filter out members that have already completed the contract

        // get contracts
        let contracts = await getAllContractsList();
        contracts = contracts.slice(-13);
        contracts = contracts.map(contract => contract.id);

        // get matching contract
        const matchingContract = await getMatchingContract(contractId);

        // extract contribution potential and add to member object
        updatedMembers = updatedMembers.map(member => {
            // get contract information from the archive, filtering for the relevant contract ids and coopAllowed
            const completedContracts = member.backup.contracts.archive.filter(contract =>
                contracts.includes(contract.contract.identifier) &&
                contract.contract.coopAllowed &&
                contract.league === 0
            );
            const contributions = completedContracts.map(contract => {
                return contract.coopLastUploadedContribution / contract.lastAmountWhenRewardGiven || 0.1;
            });

            return Object.assign({}, member, {contributionPotential: contributions.reduce((a, b) => a + b) / contributions.length});
        });

        // sort members by EB
        updatedMembers = updatedMembers.sort((a, b) => a.earningsBonus - b.earningsBonus);

        /**
         * from here on, the groups are assigned
         * parameters are:
         * - updatedMembers: A list of all members participating in this contract, sorted by EB
         * - matchingContract: The contract to extract the coop size and thereby the number of groups needed
         * First, the number of needed groups is calculated based on member count and coop size
         * Each of the groups gets one player assigned, starting with the highest EB
         * After that, we loop through all players and assign them based on contribution potential
         * by assigning the player with the highest cp to the group with the lowest cp, a more or less fair split is performed
         * May brake for coop sizes of 2...
         */

        // calculate the number of coops we need
        const numberOfGroups = Math.ceil(updatedMembers.length / matchingContract.maxCoopSize);

        // create a list of empty lists. use fill(null).map() to create independent arrays
        let groups = new Array(numberOfGroups).fill(null).map(() => []);

        // assign highest EB players to each group
        groups.forEach(group => {
            group.push(updatedMembers.pop());
        })

        // sort remaining players by contribution potential
        updatedMembers = updatedMembers.sort((a, b) => a.contributionPotential - b.contributionPotential);

        // assign remaining players to groups
        while (updatedMembers.length !== 0) {
            groups = groups.sort((a, b) => sumGroupContributionPotential(a) - sumGroupContributionPotential(b));
            groups.forEach(group => {
                if (updatedMembers.length === 0) return;
                group.push(updatedMembers.pop());
            })
        }

        // send a message with suggested teams
        await message.channel.send({embed: getCoopAssignmentSuggestionMessage(matchingContract.name, contractId, groups)});
    } catch (e) {
        throw e;
    }


}

const sumGroupContributionPotential = (group) => {
    return group.reduce((a, b) => a + b.contributionPotential, 0);
}
