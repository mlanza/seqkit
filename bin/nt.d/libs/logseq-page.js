import Blockifier from './blockifer.js';
import Unblockifier from './unblockifer.js';

class LogseqPage {
  static parse(input) {
    return Blockifier.parse(input);
  }

  static stringify(blocks) {
    return Unblockifier.reconst(blocks);
  }
}

export default LogseqPage;