// Shared test fixtures/setup for PegaQuality test split (verbatim from original suite).
import { PegaRuleAstParser } from '../../PegaRuleAstParser.js';
import { PegaGoldenDataset } from '../../quality/PegaGoldenDataset.js';
import { PegaRoundTripValidator } from '../../quality/PegaRoundTripValidator.js';
import { PegaMutationTester } from '../../quality/PegaMutationTester.js';

const parser = new PegaRuleAstParser();
const dataset = new PegaGoldenDataset();
const roundTrip = new PegaRoundTripValidator(parser);
const mutationTester = new PegaMutationTester(parser);

export { parser, dataset, roundTrip, mutationTester };
