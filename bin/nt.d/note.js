#!/usr/bin/env deno run --allow-all
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { TextLineStream } from "https://deno.land/std/streams/text_line_stream.ts";
import Task from "https://esm.sh/data.task";

const LOGSEQ_ENDPOINT = Deno.env.get('LOGSEQ_ENDPOINT') || null;
const LOGSEQ_TOKEN = Deno.env.get('LOGSEQ_TOKEN') || null;
const LOGSEQ_REPO = Deno.env.get('LOGSEQ_REPO') || null;

const comp = (...fns) => (...args) =>
  fns.reduceRight((acc, fn, i) =>
    i === fns.length - 1 ? fn(...acc) : fn(acc),
  args)

function println(lines){
  Array.isArray(lines) ? lines.forEach(line => console.log(line)) : console.log(lines);
}

function abort(error){
  error && console.error('Aborted:', error?.message || error);
  Deno.exit(1);
}

const take = (xs, n = Infinity) =>
  Array.isArray(xs) ? xs.slice(0, n) : [];

function all (tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return Task.of([]);
  }

  return new Task((reject, resolve) => {
    const results = new Array(tasks.length);
    let completed = 0;
    let hasRejected = false;
    const cleanups = [];

    // Handle individual task completion
    const handleComplete = (index, result) => {
      if (hasRejected) return;

      results[index] = result;
      completed++;

      if (completed === tasks.length) {
        resolve(results);
      }
    };

    // Handle individual task rejection
    const handleReject = (error) => {
      if (hasRejected) return;

      hasRejected = true;
      reject(error);

      // Clean up all remaining tasks
      cleanups.forEach(cleanup => cleanup && cleanup());
    };

    // Fork all tasks
    tasks.forEach((task, index) => {
      const cleanup = task.fork(
        (error) => handleReject(error),
        (result) => handleComplete(index, result)
      );
      cleanups.push(cleanup);
    });

    // Return cleanup function
    return () => {
      hasRejected = true;
      cleanups.forEach(cleanup => cleanup && cleanup());
    };
  });
};

function juxt(...fns){
  return function(x){
    return Task.all(fns.reduce(function(memo, f){
      memo.push(f(x));
      return memo;
    }, []));
  }
}

Task.all = all;
Task.juxt = juxt;

function promise(tsk){
  return new Promise(function(resolve, reject){
    tsk.fork(reject, resolve);
  });
}

function fmt(options){
  const format = options.json ? 'json' : (options.format || 'md');
  return function(results){
    if (format === "json") {
      return JSON.stringify(results, null, 2);
    } else {
      return results;
    }
  }
}

function toInt(s) {
  try {
    return typeof s === 'string' && /^-?\d+$/.test(s) ? Number(s) : null
  } catch {
    return null;
  }
}

function tskNormalizedName(name){
  return tskLogseq('logseq.Editor.getPage', [toInt(name) || name]).map(page => page?.originalName);
}

const getNormalizedName = comp(promise, tskNormalizedName);

function tskJournalDay(name){
  return tskLogseq('logseq.Editor.getPage', [name]).map(function(page){
    if (!page) return false;
    const { journalDay } = page;
    return journalDay;
  });
}

const journalDay = comp(promise, tskJournalDay);

async function exists(path){
  try {
    await Deno.stat(path);
    return path
  } catch {
    return null;
  }
}

function encode(name){
  return name ? encodeURIComponent(name).replaceAll("%20", " ").replaceAll("%2C", ",").replaceAll(/\./g, "%2E") : null;
}

function formatYYYYMMDD(n) {
  const s = String(n).padStart(8, '0')
  return s.slice(0, 4) + '_' + s.slice(4, 6) + '_' + s.slice(6, 8)
}


function getFilePath(day, name){
  const where = day ? "journals" : "pages";
  const normalized = day ? formatYYYYMMDD(day) : encode(name.trim());
  return `${LOGSEQ_REPO}/${where}/${normalized}.md`;
}

const je = /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/;

function tskGetJournalPage(datestamp){
  return new Task(function(reject, resolve){
    const arg = datestamp.split(' ')?.[0].replaceAll("-", "");
    qry(`[:find (pull ?p [*]) :where [?p :block/journal-day ${arg}]]`).fork(reject, function(result){
      const obj = result?.[0]?.[0] || {};
      resolve(obj["journal?"] ? obj["original-name"] : null);
    });
  });
}

const getJournalPage = comp(promise, tskGetJournalPage);

async function identify(given){
  if (!given) {
    throw new Error('Name argument is required');
  }

  if (!LOGSEQ_REPO) {
    throw new Error('LOGSEQ_REPO environment variable is not set');
  }

  const journal = given.match(/(\d{4})-?(\d{2})-?(\d{2})(?!\d)/);
  const normalized = await getNormalizedName(given) || (journal ? await getJournalPage(given) : null);
  const alias = normalized ? await aka(normalized) : null;
  const name = alias || normalized || given; // fallback to given if normalized is null
  const day = journal ? parseInt(journal[1] + journal[2] + journal[3]) : await journalDay(name);
  const path = name ? getFilePath(day, name) : null;
  const identifiers = {given, day, normalized, name, path};
  //console.log({identifiers});
  return identifiers;
}

function tskLogseq(method, args){
  return new Task(async function(reject, resolve){
    try {
      if (!LOGSEQ_ENDPOINT) {
        throw new Error('LOGSEQ_ENDPOINT environment variable is not set');
      }

      if (!LOGSEQ_TOKEN) {
        throw new Error('LOGSEQ_TOKEN environment variable is not set');
      }

      const payload = { method }
      if (args) {
        payload.args = args
      }

      const response = await fetch(LOGSEQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json()
      if (result?.error) {
        throw new Error(result.error);
      }

      resolve(result);

    } catch (ex) {
      reject(ex);
    }
  });
}

const callLogseq = comp(promise, tskLogseq);

function qryPrerequisites(name){
  return new Task(function(reject, resolve){
    qry(`[:find (pull ?p [:block/properties :block/original-name]) :where [?p :block/original-name "${name}"]]`).fork(reject, function(results){
      resolve(results?.[0]?.[0]?.properties?.prerequisites || []);
    });
  });
}

function prerequisites(name){
  return new Task(async function(reject, resolve){
    const seen = new Set();
    const result = [];

    async function dfs(given) {
      const {name} = await identify(given);

      if (seen.has(name)) return;          // dedupe + short-circuit

      seen.add(name);
      result.push(name);                   // keep "first name comes up top" order

      const prereqs = await promise(qryPrerequisites(name));
      for (const prereqName of prereqs) {
        await dfs(prereqName);             // nesting until leaf nodes
      }
    }

    try {
      await dfs(name);
    } catch (ex) {
      reject(ex);
    }
    resolve(result);
  });
}

function pipeable(g){
  return async function (options, ...args){
    const f = g(options);
    await incoming(async function(arg){
      await promise(f(arg, ...args).map(fmt(options))).catch(abort).then(println);
    }, async function(){
      await promise(f(...args).map(fmt(options))).catch(abort).then(println);
    });
  }
}

const nonBlankLines = {
  transform: (line, c) => line.trim() && c.enqueue(line)
}

async function incoming(one, only) {
  if (Deno.isatty(Deno.stdin.rid)) {   // If stdin is a TTY, no piping is happening
    await only();
    return;
  }

  const streamed = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .pipeThrough(new TransformStream(nonBlankLines));

  let received = false;
  try {
    for await (const line of streamed) {
      await one(line);
      received = true;
    }
  } finally {
    if (!received) {
      await only();
    }
  }
}

function oldPipeable(g){
  return async function (options, ...args){
    const f = g(options);
    await incoming(function(arg){
      return f(arg, ...args);
    }, function(){
      return f(...args);
    });
  }
}

// Recursive filtering function for blocks
function selectBlock(block, keep) {
  const {content, properties} = block;
  const props = /^[^\s:]+:: .+/;

  // Test content with and without marker to catch both cases
  const kept = props.test(content) || keep(content);

  if (!kept) {
    return null;
  }

  let filteredChildren = [];
  if (block.children && Array.isArray(block.children)) {
    filteredChildren = block.children
      .map(child => selectBlock(child, keep))
      .filter(child => child !== null); // Remove null entries (filtered out children)
  }

  // If this block doesn't have meaningful content and all children were filtered out, filter this block too
  const hasContent = content || null;
  const hasProperties = properties && Object.keys(properties).length > 0;
  const hasMeaningfulContent = hasContent || hasProperties;

  if (!hasMeaningfulContent && filteredChildren.length === 0) {
    return null; // This block has no meaningful content and no children after filtering
  }

  // Keep this block (it doesn't match any patterns)
  return {
    ...block,
    children: filteredChildren
  };
}

function normalizeSeparator(parts){
  return (parts.join("\n").trim() + "\n").split("\n");
}

// Helper function to convert nested JSON back to markdown format
function nestedJsonToMarkdown(blocks, level = 0) {
  const lines = [];
  const indent = '  '.repeat(level);
  const hanging = '  '.repeat(level + 1);

  blocks.forEach(function(block) {
    const {content, children} = block;
    if (content) {
      const [line, ...parts] = content.split("\n");
      if (line.includes("::")) {
        lines.push(`${indent}${line}`);
        for(const line of normalizeSeparator(parts)){
          lines.push(`${indent}${line}`);
        }
      } else {
        lines.push(`${indent}- ${line}`);
        for(const line of parts){
          if (!line.startsWith("collapsed:: ")) {
            lines.push(`${hanging}${line}`);
          }
        }
      }
    }

    if (children && children.length > 0) {
      lines.push(...nestedJsonToMarkdown(children, level + 1));
    }
  });

  return lines;
}

const shorthand = {
  "~tasks": "^(TODO|DOING|LATER|NOW|CANCELED|WAITING)",
  "~links": '^\\s*(?:https?:\\/\\/\\S+|\\[[^\\]\\r\\n]+\\]\\(\\s*https?:\\/\\/[^\\s)]+(?:\\s+"[^"\\r\\n]*")?\\s*\\))\\s*$'
}

function keeping(patterns, hit = true){
  const miss = !hit;
  const regexes = (patterns || []).map(what => shorthand[what] || what).map(pattern => new RegExp(pattern));
  return regexes.length ? function(text){
    for(const re of regexes) {
      if (re.test(text)) {
        return hit;
      }
    }
    return miss;
  } : null
}

function page(options){
  const format = options.json ? 'json' : (options.format || 'md');
  const heading = options.heading !== false;
  const nest = options.nest || false;
  const keep = keeping(options.less, false) || keeping(options.only, true);

  return async function(given){
    try {
      const {name, path, normalized} = await identify(given);
      if (!normalized) {
        throw new Error(`Page not found: ${given}`);
      }

      const found = await exists(path);

      if (!found) {
        return;
      }

      // STAGE 1: Exception case - Simple MD format without nest and without filter
      // Bypass all processing and just print the page directly from file
      if (format === 'md' && !nest && keep == null) {

        try {
          const content = (await Deno.readTextFile(path)).replace(/\s+$/, '');

          if (heading && content) {
            console.log(`# ${name}`);
          }
          console.log(content);
          if (heading) {
            console.log("");
          }
        } catch (fileError) {
          console.error(`Warning: Could not read page file: ${path} (${fileError.message})`);
        }
        return;
      }

      // STAGE 2: Common Data Gathering
      // Gather all data into a common structure
      let data;

      const result = await callLogseq('logseq.Editor.getPageBlocksTree', [name]);

      data = result || [];

      // STAGE 3: Unified Filtering
      // Apply filters if any are provided (regardless of nest)
      if (keep) {
        // Always use hierarchical filtering since API returns hierarchical data
        data = data
          .map(block => selectBlock(block, keep))
          .filter(block => block !== null);
      }

      // STAGE 4: Unified Format Output
      if (format === 'json') {
        // Output data as JSON
        console.log(JSON.stringify(data, null, 2));
      } else if (format === 'md') {
        if (heading) {
          console.log(`# ${name}`);
        }
        const markdownLines = nestedJsonToMarkdown(data);
        if (markdownLines.length > 0) {
          console.log(markdownLines.join('\n'));
        }
        if (heading) {
          console.log();
        }
      } else {
        throw new Error(`Unknown format: ${format}`);
      }
    } catch (error) {
      abort(error);
    }
  }
}

function search(term){
  return new Task(function(reject, resolve){
    tskLogseq('logseq.Editor.search', [term]).
      fork(reject, async function(result){
        const pageIds = new Set()
        result?.
          blocks?.
          map(block => block['block/page']).
          forEach(id => pageIds.add(id));

        const pageNames =
          await Promise.all(Array.from(pageIds).
            map(async function(id){
              try {
                const pageResult = await callLogseq('logseq.Editor.getPage', [id]);
                return pageResult?.originalName;
              } catch (ex) {
                reject(new Error(`Warning: Could not get page ${id}: ${ex.message}`));
              }
            }));

        resolve(pageNames);
      });
  });
}

function path(){
  return function(name){
    return tskNames(name).
      map(({path}) => path);
  }
}

function tskNamed(id){
  return new Task(async function(reject, resolve){
    try {
      const {name} = await identify(id);
      resolve(name);
    } catch (error) {
      reject(error);
    }
  });
}

function constantly(f){
  return function(){
    return f;
  }
}

function tags(options){
  return has(options, "tags");
}

function alias(options){
  return has(options, "alias");
}

const aka = comp(async function(results){
  const result = await results;
  return result?.[0];
}, promise, alias({format: "md"}));

function qryProps(prop, vals, mode = "any"){
  return new Task(function(reject, resolve){
    if (!['any', 'all'].includes(mode)){
      reject(new Error(`Mode must be "any" or "all" and was "${mode}".`));
    }
    if (vals.length === 0) {
      reject(new Error('At least one prop value is required'));
    }
    const conditions = vals.map(val => `[(contains? ?prop "${val}")]`).join(' ');
    const whereClause = mode === 'any' ? `(or ${conditions})` : conditions;
    return qry(`[:find (pull ?page [:block/original-name])
                  :where
                  [?page :block/properties ?props]
                  [(get ?props :${prop}) ?prop]
                  ${whereClause}]`).
      fork(reject, function(results){
        const names = results.map(function([item]){
          return item?.["original-name"];
        }).filter(name => name);
        resolve(names);
      });
  })
}

function has(options, prop = null){
  // Validate mutually exclusive options
  if (options.all && options.any) {
    throw new Error('--all and --any options are mutually exclusive');
  }

  const qry = function(prop, ...vals){
    return qryProps(prop, vals, options.any ? 'any' : 'all');
  }

  return prop ? qry.bind(null, prop) : qry;
}

function qryBacklinks(name, limit = Infinity){
  return new Task(async function(reject, resolve){
    try {
      if (!name) {
        reject(new Error('Page name is required'));
      }

      const items = await promise(qry(`[:find (pull ?b [:block/content :block/page]) :where [?b :block/path-refs ?p] [?p :block/name "${name.toLowerCase()}"]]`, limit));

      const pageIds = new Set()
      items?.forEach(item => {
        const block = item?.[0];
        if (block?.page?.id) {
          pageIds.add(block.page.id);
        }
      });

      // Get page details for each unique page ID
      const pageNames = new Set()
      for (const pageId of pageIds) {
        try {
          const pageResult = await callLogseq('logseq.Editor.getPage', [pageId])
          if (pageResult && pageResult.originalName) {
            pageNames.add(pageResult.originalName);
          }
        } catch (pageError) {
          // Continue with other pages if one fails
          reject(new Error(`Warning: Could not get page ${pageId}: ${pageError.message}`));
        }
      }

      resolve(Array.from(pageNames));

    } catch (error) {
      reject(error);
    }
  });
}

function backlinks(options){
  const limit = options.limit ? parseInt(options.limit) : Infinity;
  return function(name){
    return qryBacklinks(name, limit);
  }
}

function query(options){
  const limit = options.limit ? parseInt(options.limit) : Infinity;
  return function(query){
    return qry(query, limit);
  }
}



async function append(options, given){
  try {
    const {name, path} = await identify(given);
    let found = await exists(path);

    if (!found && options.exists) {
      throw new Error(`Page "${name}" does not exist.`);
    }

    const hasStdin = !Deno.isatty(Deno.stdin.rid);
    if (!hasStdin) {
      throw new Error('Must supply content via stdin.');
    }

    // Use SAX Builder for proper hierarchical content handling
    const builder = new SAXLogseqBuilder(name, callLogseq, !found);
    await builder.processStream();
    
    console.log(`Appended content to: ${path}`);
  } catch (error) {
    abort(error);
  }
}

async function prepend(options, given){
  try {
    const {name, path} = await identify(given);

    const found = await exists(path);

    if (!found && options.exists) {
      throw new Error(`Page "${name}" does not exist.`);
    }

    const hasStdin = !Deno.isatty(Deno.stdin.rid);
    if (!hasStdin) {
      throw new Error('Must supply content via stdin.');
    }

    // For prepend, always add to very beginning of page
    let prependToBeginning = false;
    const blocks = await callLogseq('logseq.Editor.getPageBlocksTree', [name]);
    if (blocks && blocks.length > 0) {
      prependToBeginning = true;
    }

    // Use SAX Builder with orientation information
    const builder = new SAXLogseqBuilder(name, callLogseq, !found);
    
    // If we need to prepend, always insert at beginning
    if (prependToBeginning) {
      // Override the createBlock method for prepend mode
      const originalCreateBlock = builder.createBlock.bind(builder);
      let firstTopLevelBlock = true;
      
      builder.createBlock = async function(content, parentUuid) {
        if (!parentUuid && firstTopLevelBlock) {
          // First top-level block: append to page (goes to beginning automatically)
          firstTopLevelBlock = false;
          const result = await builder.logseqApi('logseq.Editor.appendBlockInPage', [
            builder.pageName,
            content
          ]);
          return result.uuid || result;
        } else {
          // All other blocks: use normal logic
          return originalCreateBlock(content, parentUuid);
        }
      };
    }
    
    await builder.processStream();
    console.log(`Prepended content to: ${path}`);
  } catch (error) {
    abort(error);
  }
}

async function addBlockRecursively(pageName, block) {
  // Add the current block
  await callLogseq('logseq.Editor.appendBlockInPage', [pageName, block.content]);

  // Recursively add children if they exist
  if (block.children && block.children.length > 0) {
    for(const child of block.children) {
      await addBlockRecursively(pageName, child);
    }
  }
}

async function write(options, given) {
  try {
    const {name, path} = await identify(given);
    const found = await exists(path);

    if (!found && options.exists) {
      throw new Error(`Page "${name}" does not exist.`);
    }

    if (found && !options.overwrite) {
      throw new Error(`Page "${name}" already exists. Use --overwrite to replace it.`);
    }

    const hasStdin = !Deno.isatty(Deno.stdin.rid);
    if (!hasStdin) {
      throw new Error('Must supply content via stdin.');
    }

    const deletedCount = await deleteAllBlocks(name);
    const content = await Deno.readTextFile('/dev/stdin');
    const lines = content.trim().split("\n");

    for(const line of lines) {
      await callLogseq('logseq.Editor.appendBlockInPage', [name, line.trim()]);
    }

    console.log(`Wrote ${lines.length} blocks to: ${path}`);
  } catch (error) {
    abort(error);
  }
}

async function deleteAllBlocks(pageName) {
  const blocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

  if (!blocks || blocks.length === 0) {
    return 0;
  }

  let deletedCount = 0;

  async function deleteBlockRecursively(block) {
    if (block.children && block.children.length > 0) {
      for (const child of block.children) {
        await deleteBlockRecursively(child);
      }
    }

    await callLogseq('logseq.Editor.removeBlock', [block.uuid]);
    deletedCount++;
  }

  for (const block of blocks) {
    await deleteBlockRecursively(block);
  }

  return deletedCount;
}

function normalizeOptions(options){
  const format = options.json ? 'json' : (options.format || 'md');
  const heading = options.heading !== false;
  return {format, heading}
}

function qry(query, limit = Infinity){
  return new Task(function(reject, resolve){
    tskLogseq('logseq.DB.datascriptQuery', [query]).fork(reject, function(results){
      resolve(take(results, limit));
    });
  });
}

function qryPage(name){
  return qry(`[:find (pull ?p [*]) :where [?p :block/original-name "${name}"]]`);
}

function tskNames(name){
  return name ? new Task(function(reject, resolve){
    identify(name).then(function(names){
      if (names?.normalized) {
        resolve(names);
      } else {
        reject(new Error(`Page not found: ${name}`));
      }
    }).catch(reject);
  }) : Task.rejected(new Error('Page name is required'));
}

function normal(name){
  return tskNames(name).map(({name}) => name);
}

function fmtProps({format}, propName = null){
  return function([name, results]){
    const pageData = results[0]?.[0] || null;

    if (format === 'json') {
      if (pageData) {
        return [name, JSON.stringify(results, null, 2)];
      }
    } else if (format === 'md') {
      return [name, propName ? pageData?.properties?.[propName] || null : Object.entries(pageData["properties-text-values"]).map(function([key, vals]){
        return `${key}:: ${vals}`;
      })];
    } else {
      throw new Error(`Unknown format: ${format}`);
    }
  }
}

function fmtBody({heading, format}){
  return function([name, content]){
    if (format === 'json') {
      return [name, JSON.stringify(content, null, 2)];
    } else if (format === 'md') {
      const lines = [];
      if (heading && name && content) {
        lines.push(`## ${name}`);
      }
      if (content) {
        typeof content == 'object' ? lines.push(...content) : lines.push(content);
      }
      if (heading && name && content) {
        lines.push("");
      }
      return lines;
    }
  }
}

function props(options){
  const heading = options.heading;
  const format = options.json ? 'json' : options.format || "md";
  return function(pageName, propName = null){
    return normal(pageName).
      chain(Task.juxt(Task.of, qryPage)).
      map(fmtProps({format, heading}, propName)).
      map(fmtBody({format, heading}));
  }
}

//TODO handle `notes props Assisting` with or without piping
function demand(...whats){
  return /*isPiped ?*/ whats.map(what => `[${what}]`).join(' ') /*: whats.map(what => `<${what}>`).join(' ')*/;
}

function tskGetAllPages(type){
  return tskLogseq('logseq.Editor.getAllPages').map(function(results){
    return type == 'all' ? results : type == "journal" ? results.filter(item => !!item["journal?"]) : results.filter(item => !item["journal?"]);
  }).map(results => results.map(page => page?.originalName));
}

const PIPED = `🚚`;

const program = new Command()
  .name('nt')
  .description(`A general-purpose tool for interacting with Logseq content.

 ${PIPED} = pipeline only operations
`.trim())
  .version('0.7.0')
  .stopEarly();

program
  .command('pages')
  .description('List pages')
  .option('-t, --type <type:string>', 'Page type (regular|journal|all)', 'regular')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(function(options){
    return function(){
      return tskGetAllPages(options.type || "regular");
    }
  }));

program
  .command('page')
  .alias('p')
  .description("Get page")
  .arguments(demand("name|datestamp"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .option('--no-heading', 'Omit H1 heading and trailing blank line for MD format')
  .option('-a, --append <content:string>', 'Append content to page')
  .option('--nest', 'Use hierarchical nesting with format output')
  .option('-l, --less <patterns:string>', 'Less content matching regex patterns', { collect: true })
  .option('-o, --only <patterns:string>', 'Only content matching regex patterns', { collect: true })
  .action(oldPipeable(page));

program
  .command('write')
  .description("Write page from stdin preserving properties")
  .arguments("<name>")
  .option('--exists', "Only if it exists")
  .option('--overwrite', "Overwrite if file already exists")
  .action(write);

program
  .command('append')
  .description("Append to page from stdin")
  .arguments("<name>")
  .option('--exists', "Only if it exists")
  .option('--debug', "Enable debug output to stderr")
  .action(append);

program
  .command('prepend')
  .description("Prepend to page from stdin")
  .arguments("<name>")
  .option('--exists', "Only if it exists")
  .action(prepend);

class SAXLogseqBuilder {
  constructor(pageName, logseqApi, isNewPage = false) {
    this.pageName = pageName;
    this.logseqApi = logseqApi;
    this.isNewPage = isNewPage;
    this.cursor = {
      currentIndent: 0,
      parentUuid: null,
      currentUuid: null,
      blockStack: []  // Maps indent levels to block UUIDs
    };
    this.debug = false;
  }

  async processStream() {
    const linesStream = Deno.stdin.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());

    for await (const line of linesStream) {
      if (this.debug) console.error(`Processing: ${JSON.stringify(line)}`);
      await this.processLine(line);
    }

    // Clean up empty block for new pages
    if (this.isNewPage) {
      await this.cleanupEmptyBlock(this.debug);
    }
  }

  async processLine(line) {
    if (!line || line.trim() === '') {
      return; // Skip empty lines
    }

    const content = line.replace(/\t/g, '  '); // Normalize tabs to spaces
    const indent = this.countLeadingSpaces(content);
    const trimmed = content.trim();
    
    const isBlock = trimmed.startsWith('- ');
    const isProperty = trimmed.includes('::') && !trimmed.startsWith('- ');
    
    if (this.debug) {
      console.error(`Line analysis: indent=${indent}, isBlock=${isBlock}, isProperty=${isProperty}, content="${trimmed}"`);
    }

    if (isBlock) {
      await this.handleBlock(trimmed, indent);
    } else if (isProperty) {
      await this.handleProperty(trimmed, indent);
    } else {
      await this.handleContent(trimmed, indent);
    }
  }

  async handleBlock(line, indent) {
    const content = line.replace(/^\s*-\s*/, '');
    
    // Adjust cursor to correct parent level
    this.adjustCursor(indent);
    
    if (this.debug) {
      console.error(`Creating block: content="${content}", parent=${this.cursor.parentUuid}`);
    }

    // Create block via API
    const blockUuid = await this.createBlock(content, this.cursor.parentUuid);
    
    // Update cursor state
    this.cursor.currentUuid = blockUuid;
    this.cursor.currentIndent = indent;
    this.cursor.blockStack[indent] = blockUuid;
    this.cursor.parentUuid = this.cursor.blockStack[indent - 1] || null;
  }

  async handleProperty(line, indent) {
    // Properties should be child blocks at the same level as the current block
    if (this.debug) {
      console.error(`Creating property block: "${line}" at indent ${indent}`);
    }
    
    // For properties, we need to find the correct parent for this indentation level
    const parentUuid = this.cursor.blockStack[indent - 1] || null;
    const propertyBlockUuid = await this.createBlock(line, parentUuid);
    
    // Update cursor to track this property block
    this.cursor.currentUuid = propertyBlockUuid;
    this.cursor.currentIndent = indent;
    this.cursor.blockStack[indent] = propertyBlockUuid;
  }

  async handleContent(line, indent) {
    if (this.debug) {
      console.error(`Creating content block: "${line}" with parent ${this.cursor.parentUuid}`);
    }
    
    // Hanging content becomes a child block of the current parent
    const parentUuid = this.cursor.parentUuid || this.cursor.currentUuid;
    const contentBlockUuid = await this.createBlock(line, parentUuid);
    
    // Update cursor to track this content block
    this.cursor.currentUuid = contentBlockUuid;
    this.cursor.currentIndent = indent;
    this.cursor.blockStack[indent] = contentBlockUuid;
  }

  adjustCursor(newIndent) {
    if (this.debug) {
      console.error(`Adjusting cursor: current=${this.cursor.currentIndent} -> new=${newIndent}`);
    }
    
    if (newIndent > this.cursor.currentIndent) {
      // Going deeper - current block becomes parent
      this.cursor.parentUuid = this.cursor.currentUuid;
    } else if (newIndent < this.cursor.currentIndent) {
      // Going up - find parent at this level
      this.cursor.parentUuid = this.cursor.blockStack[newIndent - 1] || null;
    }
    // Same level - parent stays the same
  }

  async createBlock(content, parentUuid) {
    try {
      const method = parentUuid ? 'logseq.Editor.insertBlock' : 'logseq.Editor.appendBlockInPage';
      const args = parentUuid 
        ? [parentUuid, content, {before: false}]
        : [this.pageName, content];
      
      const result = await this.logseqApi(method, args);
      return result.uuid || result;
    } catch (error) {
      console.error(`Error creating block: ${error.message}`);
      throw error;
    }
  }

  countLeadingSpaces(str) {
    const match = str.match(/^\s*/);
    return match ? Math.floor(match[0].length / 2) : 0; // Assuming 2 spaces per level
  }

  async cleanupEmptyBlock(debug = false) {
    try {
      if (debug) {
        console.error('DEBUG: Cleaning up empty block from new page');
      }
      
      // Get all blocks in the page
      const blocks = await this.logseqApi('logseq.Editor.getPageBlocksTree', [this.pageName]);
      
      if (!blocks || blocks.length === 0) {
        if (debug) {
          console.error('DEBUG: No blocks found to clean up');
        }
        return;
      }

      // Find the first (empty) block - it should be one with empty content
      const firstBlock = blocks.find(block => !block.content || block.content.trim() === '');
      
      if (firstBlock) {
        if (debug) {
          console.error(`DEBUG: Found empty block to remove: ${firstBlock.uuid}`);
        }
        
        // Remove the empty block
        await this.logseqApi('logseq.Editor.removeBlock', [firstBlock.uuid]);
        
        if (debug) {
          console.error('DEBUG: Successfully removed empty block');
        }
      } else {
        if (debug) {
          console.error('DEBUG: No empty block found to remove');
        }
      }
    } catch (error) {
      console.error('Warning: Failed to clean up empty block:', error.message);
      // Don't abort - this is cleanup, not core functionality
    }
  }
}





program
  .command('tags')
  .alias('t')
  .description('List pages with given tags (default: ALL tags)')
  .arguments(demand("tags..."))
  .option('--all', 'Require ALL tags to be present (default)')
  .option('--any', 'Require ANY tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(tags));

program
  .command('has')
  .alias('h')
  .description('List pages having a given prop with value(s)')
  .arguments(demand("prop", "vals..."))
  .option('--all', 'Require ALL tags to be present (default)')
  .option('--any', 'Require ANY tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(has));

program
  .command('prereq')
  .description('Recursively list page prerequisites')
  .arguments(demand("name"))
  .action(pipeable(constantly(prerequisites)));

program
  .command('path')
  .description('The path to the page file')
  .arguments(demand("name"))
  .action(pipeable(path));

program
  .command('props')
  .description('Get page properties')
  .arguments(demand("name", "property"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--desc', "With description")
  .option('--json', 'Output JSON format')
  .option('--no-heading', 'Omit H1 heading and trailing blank line for MD format')
  .action(pipeable(props));

program
  .command('search')
  .alias('s')
  .description('Search pages')
  .arguments(demand("term"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(constantly(search)));

program
  .command('name')
  .alias('n')
  .description('Get page name from ID or normalized name from name')
  .arguments(demand("id|name"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(constantly(tskNamed)));

program
  .command('alias')
  .description('Get page name from alias')
  .arguments(demand("alias"))
  .action(pipeable(alias));

program
  .command('backlinks')
  .alias('b')
  .description('List pages that link to a given page')
  .arguments(demand("name"))
  .option('--limit <type:string>', 'Limit to N entries (none = no limit) (default: "none")', 'none')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(backlinks));

program
  .command('query')
  .alias('q')
  .description('Run Datalog query')
  .arguments(demand("query"))
  .option('--limit <type:string>', 'Limit to N entries (none = no limit) (default: "none")', 'none')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', 'md')
  .option('--json', 'Output JSON format')
  .action(pipeable(query));

// External command stubs for help visibility
program
  .command('list')
  .alias('l')
  .arguments("[item...]")
  .description('List items');

program
  .command('root')
  .description('Expose repo path');

program
  .command('day')
  .alias('d')
  .arguments("[offset...]")
  .description('List one or more days');

program
  .command('skills')
  .description('List known skills');

program
  .command('about')
  .alias('a')
  .arguments("<name>")
  .description('Retrieves information about a topic');

program
  .command('seen')
  .description('Filters to seen lines')
  .arguments(PIPED);

program
  .command('exists')
  .description('Filters paths for existing files')
  .arguments(PIPED);

program
  .command('links')
  .description('Extracts links')
  .arguments(PIPED);

program
  .command('wikilinks')
  .description('Extracts wikilinks')
  .arguments(PIPED);

program
  .command('wikify')
  .description('Convert markdown headers to wiki format')
  .arguments(PIPED);

if (import.meta.main) {
  if (Deno.args.length === 0) {
    program.showHelp();
    abort();
  }
  await program.parse();
}
