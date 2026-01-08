#!/usr/bin/env deno run --allow-all
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { TextLineStream } from "https://deno.land/std/streams/text_line_stream.ts";
import { parse } from "jsr:@std/toml";
import Task from "https://esm.sh/data.task";

const isWindows = Deno.build.os === "windows";

const orientSlashes = isWindows ? function (path) {
  return path ? path.replaceAll("/", "\\") : null;
} : function (path) {
  return path ? path.replaceAll("\\", "/") : null;
}

const HOME = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
const NOTE_CONFIG = orientSlashes(Deno.env.get("NOTE_CONFIG") ?? `${HOME}/.config/nt/config.toml`);

function tskConfig(path){
  function expandLogseq(logseq){
    const token = Deno.env.get('LOGSEQ_TOKEN') || null;
    if (!token) {
      throw new Error("LOGSEQ_TOKEN environment var must be set.");
    }
    const repo = logseq?.repo?.replace("~", HOME);
    if (!repo) {
      throw new Error("Logseq repo must be set.");
    }
    const endpoint = "http://127.0.0.1:12315/api";
    return {endpoint, token, ...logseq, repo};
  }
  return new Task(async function(reject, resolve){
    try {
      const existing = await exists(path);
      if (!existing) {
        throw new Error("Note config not established.");
      }
      const text = await Deno.readTextFile(existing);
      const cfg = parse(text);

      const logseq = expandLogseq(cfg.logseq ?? {});
      const shorthand = cfg.shorthand ?? {};
      const agentignore = cfg.agentignore ?? [];

      resolve({ logseq, shorthand, agentignore });
    } catch (cause) {
      reject(new Error(`Problem reading config at ${path}.`, {cause}));
    }
  });
}

const comp = (...fns) => (...args) =>
  fns.reduceRight((acc, fn, i) =>
    i === fns.length - 1 ? fn(...acc) : fn(acc),
  args);

function promise(tsk){
  return new Promise(function(resolve, reject){
    tsk.fork(reject, resolve);
  });
}

const loadConfig = comp(promise, tskConfig);

function println(lines){
  const lns = Array.isArray(lines) ? lines : lines == null ? [] : [lines];
  lns.forEach(line => console.log(line))
}

function abort(error){
  error && console.error(error);
  Deno.exit(error ? 1 : 0);
}

const config = await loadConfig(NOTE_CONFIG).catch(abort);

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

function fmt({format}){
  return function(results){
    if (format === "json") {
      return results ? JSON.stringify(results, null, 2) : null;
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

function getLogger(debug = false) {
  return debug ? console : { log: () => null };
}

async function readStdin() {
  const decoder = new TextDecoder();
  let payload = "";

  try {
    for await (const chunk of Deno.stdin.readable) {
      payload += decoder.decode(chunk);
    }
  } catch (error) {
    abort(error);
  }

  return payload.trim();
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
  return name ?
    encodeURIComponent(name).
      replaceAll("%20", " ").
      replaceAll("%2C", ",").
      replaceAll(/\./g, "%2E") :
    null;
}

function datestamp(dt = new Date()){
  return dt.toISOString().slice(0, 10);
}

function isDatestamp(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function withWeekday(ymd) {
  const d = new Date(ymd);
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${ymd} ${day}`;
}

function formatYYYYMMDD(n) {
  const s = String(n).padStart(8, '0')
  return s.slice(0, 4) + '_' + s.slice(4, 6) + '_' + s.slice(6, 8)
}

function getFilePath(day, name){
  const where = day ? "journals" : "pages";
  const normalized = day ? formatYYYYMMDD(day) : encode(name.trim());
  return `${config.logseq.repo}/${where}/${normalized}.md`;
}

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

function tskIdentify(given){
  return given ? new Task(async function(reject, resolve){
    try {
      const journal = given.match(/(\d{4})-?(\d{2})-?(\d{2})(?!\d)/);
      const normalized = await getNormalizedName(given) || (journal ? await getJournalPage(given) : null);
      const alias = normalized ? await aka(normalized) : null;
      const name = alias || normalized;
      const day = journal ? parseInt(journal[1] + journal[2] + journal[3]) : await journalDay(name);
      const path = name ? getFilePath(day, name) : null;
      const identifiers = {given, day, normalized, name, path};
      //console.log({identifiers});
      resolve(identifiers);

    } catch (ex) {
      reject(ex);
    }
  }) : Task.rejected(new Error('Page name is required'));
}

const identify = comp(promise, tskIdentify);

function tskLogseq(method, args){
  return new Task(async function(reject, resolve){
    try {
      const payload = { method }
      if (args) {
        payload.args = args
      }

      const response = await fetch(config.logseq.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.logseq.token}`,
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

function tskPrerequisites(name){
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

// Helper function to call wipe command logic
function tskWipe(pageName, options) {
  const logger = getLogger(options.debug || false);
  return new Task(async function(reject, resolve) {
    logger.log(`Wiping content from page '${pageName}'...`);

    try {

      if (!pageName) {
        throw new Error("Page name must be specified");
      }

      // Check if page exists
      const pageCheck = await callLogseq('logseq.Editor.getPage', [pageName]);

      if (!pageCheck || !pageCheck.uuid) {
        // Page doesn't exist, no need to wipe
        resolve({ deletedCount: 0, propertiesCount: 0, alreadyEmpty: true });
        return;
      }

      const pageUuid = pageCheck.uuid;
      logger.log(`Page exists with UUID: ${pageUuid}`);

      // Get all page blocks
      const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      if (!pageBlocks || pageBlocks.length === 0) {
        resolve({ deletedCount: 0, propertiesCount: 0, alreadyEmpty: true });
        return;
      }

      // Find blocks to delete (those without meaningful properties)
      const blocksToDelete = [];
      const propertiesBlocksFound = [];

      for (const block of pageBlocks) {
        let hasRealProperties = false;

        if (block.properties && typeof block.properties === 'object' && Object.keys(block.properties).length > 0) {
          if (block.content !== "" && block.content !== null) {
            hasRealProperties = true;
          }
        }

        if (hasRealProperties) {
          propertiesBlocksFound.push(block);
          logger.log(`Found properties block, keeping: ${block.uuid}`);
        } else {
          blocksToDelete.push(block);
          logger.log(`Marked for deletion: ${block.uuid} - content: '${block.content}'`);
        }
      }

      if (blocksToDelete.length === 0) {
        resolve({ deletedCount: 0, propertiesCount: propertiesBlocksFound.length, alreadyEmpty: true });
        return;
      }

      logger.log(`Found ${blocksToDelete.length} blocks to delete`);
      logger.log(`Found ${propertiesBlocksFound.length} properties blocks to keep`);

      // Delete each non-property block
      let deletedCount = 0;
      for (const block of blocksToDelete) {
        logger.log(`Deleting block: ${block.uuid}`);

        try {
          const deleteResponse = await callLogseq('logseq.Editor.removeBlock', [block.uuid]);

          if (deleteResponse === null) {
            deletedCount++;
            logger.log(`Deleted block: ${block.uuid}`);
          } else {
            logger.log(`Failed to delete block: ${block.uuid}`);
          }
        } catch (error) {
          logger.log(`Failed to delete block: ${block.uuid} - ${error.message}`);
        }
      }

      const result = {
        deletedCount,
        propertiesCount: propertiesBlocksFound.length,
        totalCount: blocksToDelete.length,
        alreadyEmpty: false
      };

      logger.log(`Wiped ${deletedCount} content blocks from page '${pageName}' (preserved ${propertiesBlocksFound.length} property blocks)`);

      resolve(result);

    } catch (error) {
      reject(error);
    }
  });
}

const wipeCommand = comp(promise, tskWipe);

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

function keeping(patterns, shorthand, hit = true){
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

function tskGetPage(given, options){
  const {format} = options;
  return given ? new Task(async function(reject, resolve){
    try {
      const patterns = options.agent || options.human ? config.agentignore : null;
      const agentLess = options.agent ? patterns : null;
      const humanOnly = options.human ? patterns : null;
      const keep = keeping(agentLess || options.less, config.shorthand, false) || keeping(humanOnly || options.only, config.shorthand, true);

      const {name, path} = await identify(given);

      if (!name) {
        resolve(null);
        return;
      }

      if (format === 'md' && keep == null) {
        const found = await exists(path);
        if (!found) {
          resolve(null);
          return;
        }

        const content = (await Deno.readTextFile(path)).replace(/\s+$/, '');
        resolve(content);
        return;
      }

      const result = (await callLogseq('logseq.Editor.getPageBlocksTree', [name])) || [];
      const data = keep ? result
          .map(block => selectBlock(block, keep))
          .filter(block => block !== null) : result;

      const lines = format === "md" ? nestedJsonToMarkdown(data).join("\n") : data;

      resolve(lines);

    } catch (ex) {
      reject(ex);
    }
  }) : Task.of(null);
}

function page(options){
  console.log({options})
  return function(given){
    return given ? tskNamed(given).
      chain(Task.juxt(Task.of, name => tskGetPage(name, options))).
      map(fmtBody(options)) : Task.of(null);
  }
}

function ident(){
  return function(given){
    return given ? tskIdentify(given).
      map(obj => console.log(JSON.stringify(obj, null, 2))) : Task.of(null);
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
              } catch (cause) {
                reject(new Error(`Could not get page ${id}.`, {cause}));
              }
            }));

        resolve(pageNames);
      });
  });
}

function tskPath(name){
  return tskIdentify(name).map(({path}) => orientSlashes(path));
}

function tskNamed(id){
  return tskIdentify(id).map(({name}) => name);
}

function constantly(f){
  return function(){
    return f;
  }
}

const path = constantly(tskPath);

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
    try {
      if (!['any', 'all'].includes(mode)){
        throw new Error(`Mode must be "any" or "all" and was "${mode}".`);
      }
      if (vals.length === 0) {
        throw new Error('At least one prop value is required');
      }
      const conditions = vals.map(val => `[(contains? ?prop "${val}")]`).join(' ');
      const whereClause = mode === 'any' ? `(or ${conditions})` : conditions;
      return qry(`[:find (pull ?page [:block/original-name])
                    :where
                    [?page :block/properties ?props]
                    [(get ?props :${prop}) ?prop]
                    ${whereClause}]`).
        fork(reject, function(results){
          const names = results.map(([item]) => item?.["original-name"]).filter(name => name);
          resolve(names);
        });
    } catch (error) {
      reject(error);
    }
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
        throw new Error('Page name is required');
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
        } catch (cause) {
          throw new Error(`Could not get page ${pageId}.`, {cause});
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

function fmtProps({format}, propName = null){
  return function([name, results]){
    const pageData = results[0]?.[0] || null;

    if (format === 'json') {
      return [name, pageData ? results : null];
    } else if (format === 'md') {
      const props = propName ? pageData?.properties?.[propName] || null : Object.entries(pageData?.["properties-text-values"] ?? {}).map(function([key, vals]){
        return `${key}:: ${vals}`;
      });
      return [name, props.length? props : null];
    } else {
      throw new Error(`Unknown format: ${format}`);
    }
  }
}

function fmtBody({heading, format, vacant}){
  return function([name, content]){
    if (format === 'json') {
      return [name, content];
    } else if (format === 'md') {
      const lines = [];
      const furniture = heading != null && name && (vacant || content);
      if (furniture) {
        lines.push(`${'#'.repeat(heading)} ${name}`.trim());
      }
      if (content) {
        typeof content == 'object' ? lines.push(...content) : lines.push(content);
      }
      if (furniture) {
        lines.push("");
      }
      return lines;
    }
  }
}

function props(options){
  return function(given, propName = null){
    return given ? tskNamed(given).
      chain(Task.juxt(Task.of, qryPage)).
      map(fmtProps(options, propName)).
      map(fmtBody(options)) : Task.of(null);
  }
}

function prop(options){
  return function(pageName){
    return addPageProperties(pageName, options).map(function(name){
      if (format === 'json') {
        return [name, options.add];
      } else {
        return [name, options.add.map(prop => {
          const [key, value] = prop.split('=');
          return `${key}:: ${value}`;
        })];
      }
    }).map(fmtBody(options));
  }
}

function addPageProperties(pageName, options){
  return new Task(async function(reject, resolve){
    try {
      if (!options.add || options.add.length === 0) {
        throw new Error('At least one --add option is required');
      }

      const {name} = await identify(pageName);
      if (!name) {
        throw new Error(`Page not found: ${pageName}`);
      }

      // Get page blocks tree to find first block (where page properties live)
      const blocksTree = await callLogseq('logseq.Editor.getPageBlocksTree', [name]);
      if (!blocksTree || blocksTree.length === 0) {
        throw new Error(`No blocks found for page: ${name}`);
      }

      const firstBlock = blocksTree[0];
      if (!firstBlock || !firstBlock.uuid) {
        throw new Error(`Could not get first block UUID for: ${name}`);
      }

      // Read existing properties from first block
      const existingProps = firstBlock.properties || {};

      // Parse new properties and group them by key (normalize to lowercase)
      const newPropMap = new Map();

      for (const propString of options.add) {
        const parts = propString.split('=');
        if (parts.length !== 2) {
          throw new Error(`Invalid property format: ${propString}. Expected "key=value"`);
        }

        const [key, value] = parts;
        if (!key.trim() || !value.trim()) {
          throw new Error(`Invalid property format: ${propString}. Key and value cannot be empty`);
        }

        const trimmedKey = key.trim().toLowerCase(); // Normalize to lowercase
        const trimmedValue = value.trim();

        // Add to array or create new array
        if (!newPropMap.has(trimmedKey)) {
          newPropMap.set(trimmedKey, [trimmedValue]);
        } else {
          newPropMap.get(trimmedKey).push(trimmedValue);
        }
      }

      // Merge existing and new properties
      const mergedProps = {};

      // Start with existing properties (convert to arrays if needed)
      for (const [key, value] of Object.entries(existingProps)) {
        if (key !== 'id' && key !== 'uuid') {
          mergedProps[key.toLowerCase()] = Array.isArray(value) ? value : [value];
        }
      }

      // Add new properties (augment, don't overwrite)
      for (const [key, newValues] of newPropMap) {
        if (mergedProps[key]) {
          // Merge with existing values, avoiding duplicates
          const existingValues = mergedProps[key];
          const allValues = [...existingValues];

          for (const newValue of newValues) {
            if (!allValues.includes(newValue)) {
              allValues.push(newValue);
            }
          }
          mergedProps[key] = allValues;
        } else {
          // New property
          mergedProps[key] = newValues;
        }
      }

      // Set merged properties on FIRST block
      try {
        await callLogseq('logseq.Editor.exitEditingMode');

        // Update each property
        for (const [key, values] of Object.entries(mergedProps)) {
          await callLogseq('logseq.Editor.upsertBlockProperty', [
            firstBlock.uuid,
            key,
            values.join(', ')
          ]);

          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Try to force save
        try {
          await callLogseq('logseq.Editor.saveFocusedCodeEditorContent');
        } catch (saveError) {
          // Method may not be available, that's ok
        }

      } catch (exitError) {
        // Fall back to basic approach
        for (const [key, values] of Object.entries(mergedProps)) {
          await callLogseq('logseq.Editor.upsertBlockProperty', [
            firstBlock.uuid,
            key,
            values.join(', ')
          ]);
        }
      }

      resolve(name);

    } catch (error) {
      reject(error);
    }
  });
}

//TODO handle `notes props Assisting` with or without piping
function demand(...whats){
  return /*isPiped ?*/ whats.map(what => `[${what}]`).join(' ') /*: whats.map(what => `<${what}>`).join(' ')*/;
}

function tskGetAllPages({type = "regular", limit = Infinity} = {}){
  const filters = {"journal": item => !!item["journal?"], "regular": item => !item["journal?"]}
  const f = filters[type];
  const filter = f ? results => results.filter(f) : results => results;
  return tskLogseq('logseq.Editor.getAllPages')
    .map(filter)
    .map(results => results.map(page => page?.originalName))
    .map(results => take(results, limit));
}

class SerialParser {
  constructor() {
    this.state = {
      rootBlocks: [],
      blockStack: [], // Stack to track current block hierarchy by level
      currentBlock: null, // The most recently created block
      currentBlockLevel: -1,
      headerContent: null,
      headerProperties: {},
      pageProperties: {}, // Properties before any blocks
      collectingProperties: false,
      pendingProperties: null, // Properties to apply to first block
      hasStartedBlocks: false // Track if we've started processing blocks
    };
  }

  parseLine(line) {
    const trimmed = line.trimStart();

    // Skip empty lines
    if (!trimmed) {
      return null;
    }

    // Handle header line - only collect it, don't return for processing
    if (this.state.headerContent === null && trimmed.startsWith('# ')) {
      this.state.headerContent = trimmed;
      return null; // Don't process this line further
    }

    // Handle properties before any block - these are page properties
    if (this.state.headerContent === null && !this.state.hasStartedBlocks && trimmed.includes('::') && !trimmed.startsWith('- ')) {
      return { type: 'page-property', content: trimmed };
    }

    // If we're still in the header section (properties after title)
    if (this.state.headerContent !== null && trimmed.includes('::') && !trimmed.startsWith('- ')) {
      return { type: 'header-property', level: 0, content: trimmed };
    }

    // If we encounter a non-property line after collecting header properties, finalize the header
    if ((this.state.headerContent !== null || this.state.collectingProperties) && !trimmed.includes('::')) {
      const headerBlock = this.finalizeHeader();
      if (headerBlock) {
        this.state.rootBlocks.push(headerBlock);
      }
      this.state.headerContent = null;
      this.state.collectingProperties = false;
      this.state.headerProperties = {};
    }

    // ONLY lines starting with "- " create new blocks
    if (trimmed.startsWith('- ')) {
      // Mark that we've started processing blocks
      this.state.hasStartedBlocks = true;

      // Calculate indentation level properly - handle both tabs and spaces
      const leadingWhitespace = line.substring(0, line.length - trimmed.length);
      const tabCount = (leadingWhitespace.match(/\t/g) || []).length;
      const spaceCount = leadingWhitespace.length - tabCount;
      const blockIndent = tabCount + Math.floor(spaceCount / 2);

      const content = trimmed.substring(2).trim();
      return { type: 'block', level: blockIndent, content };
    }

    // Property lines attach to current block
    if (trimmed.includes('::')) {
      return { type: 'property', content: trimmed };
    }

    // Everything else is hanging content for current block
    return { type: 'content', content: trimmed };
  }

  finalizeHeader() {
    let headerContent = this.state.headerContent || '';
    const { properties, cleanContent } = this.extractProperties(headerContent);
    // Merge with accumulated header properties
    Object.assign(properties, this.state.headerProperties);

    // Only create a block if we have actual header content
    if (!headerContent.startsWith('# ')) {
      return null;
    }

    const block = {
      properties: this.formatProperties(properties),
      preBlock: true
    };

    // Only include content if we have actual content after cleaning
    if (cleanContent && cleanContent.trim()) {
      block.content = cleanContent + '\n';
    }

    return block;
  }

  extractMarker(content) {
    const markerRegex = /^(TODO|DOING|DONE|WAITING|CANCELED|NOW|LATER)\s+(.+)/i;
    const match = content.match(markerRegex);
    if (match) {
      return { marker: match[1].toUpperCase(), content: match[2].trim() };
    }
    return { marker: null, content };
  }

  extractProperties(content) {
    if (/^(.+?)::\s*(.+)$/.test(content.trim())) {
      const propertyRegex = /^(.+?)::\s*(.+)$/gm;
      const properties = {};
      let cleanContent = content;

      let match;
      while ((match = propertyRegex.exec(content)) !== null) {
        const [full, key, value] = match;
        properties[key.trim()] = value.trim();
        cleanContent = cleanContent.replace(full, '').trim();
      }

      return { properties, cleanContent };
    }

    return { properties: {}, cleanContent: content };
  }

  formatProperties(properties) {
    const arrayKeys = ['tags', 'alias', 'prerequisites'];
    const booleanKeys = ['collapsed'];
    const formatted = {};

    for (const key of Object.keys(properties)) {
      if (arrayKeys.includes(key)) {
        formatted[key] = properties[key]
          .split(',')
          .map(item => item.trim().replace(/[\[\]]/g, ''))
          .filter(item => item.length > 0);
      } else if (booleanKeys.includes(key)) {
        // Convert string 'true'/'false' to boolean
        formatted[key] = properties[key] === 'true' || properties[key] === true;
      } else {
        formatted[key] = properties[key];
      }
    }

    return formatted;
  }

  createBlock(content) {
    const { marker, cleanContent: markerContent } = this.extractMarker(content);

    let finalContent = markerContent || content;
    const allProperties = {};

    // Apply any pending properties to the first block
    if (this.state.pendingProperties) {
      Object.assign(allProperties, this.state.pendingProperties);
      this.state.pendingProperties = null; // Clear after applying
    }

    // Extract any inline properties from the content itself
    const { properties: inlineProperties, cleanContent } = this.extractProperties(finalContent);
    Object.assign(allProperties, inlineProperties);
    finalContent = cleanContent;

    // Handle collapsed:: true property
    if (allProperties.collapsed === 'true') {
      allProperties.collapsed = true;
    }

    // Don't extract priority markers like [#A] - leave them as inline content
    // They are not properties, just regular content

    const block = {
      content: finalContent || ''
    };

    if (marker) {
      block.marker = marker;
    }

    // Handle collapsed as special top-level property, not in properties object
    if (allProperties.collapsed === true) {
      block.collapsed = true;
      delete allProperties.collapsed;
    }

    if (Object.keys(allProperties).length > 0) {
      block.properties = this.formatProperties(allProperties);
    }

    return block;
  }

  addPropertyToCurrentBlock(propertyContent) {
    const { properties } = this.extractProperties(propertyContent);

    // If we don't have a current block yet, store these properties to be applied to the first block
    if (!this.state.currentBlock) {
      if (!this.state.pendingProperties) {
        this.state.pendingProperties = {};
      }
      Object.assign(this.state.pendingProperties, properties);
      return;
    }

    if (!this.state.currentBlock.properties) {
      this.state.currentBlock.properties = {};
    }

    // Handle collapsed as special top-level property
    if (properties.collapsed === 'true') {
      this.state.currentBlock.collapsed = true;
      delete properties.collapsed;
    }

    Object.assign(this.state.currentBlock.properties, this.formatProperties(properties));
  }

  appendContentToCurrentBlock(content) {
    if (!this.state.currentBlock) {
      console.error('Warning: Content found without current block:', content);
      return;
    }

    // Append content with newline if there's already content
    if (this.state.currentBlock.content) {
      this.state.currentBlock.content += '\n' + content;
    } else {
      this.state.currentBlock.content = content;
    }
  }

  handleBlock(parsedLine) {
    const { level, content } = parsedLine;

    // Create the new block
    const newBlock = this.createBlock(content);

    // Adjust stack to match the new block's level
    while (this.state.blockStack.length > level) {
      this.state.blockStack.pop();
    }

    // Add missing parent blocks if needed (shouldn't happen in well-formed input)
    while (this.state.blockStack.length < level) {
      if (this.state.blockStack.length === 0 && this.state.rootBlocks.length > 0) {
        this.state.blockStack.push(this.state.rootBlocks[this.state.rootBlocks.length - 1]);
      } else if (this.state.blockStack.length > 0) {
        this.state.blockStack.push(this.state.blockStack[this.state.blockStack.length - 1]);
      } else {
        // Create placeholder block - this shouldn't happen with valid input
        const placeholder = { content: '' };
        this.state.rootBlocks.push(placeholder);
        this.state.blockStack.push(placeholder);
      }
    }

    // Determine parent and add to appropriate children array
    if (level === 0) {
      // Top-level block
      this.state.rootBlocks.push(newBlock);
    } else {
      // Nested block - add to parent's children
      const parent = this.state.blockStack[level - 1];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(newBlock);
    }

    // Update stack and current block
    this.state.blockStack[level] = newBlock;
    this.state.currentBlock = newBlock;
    this.state.currentBlockLevel = level;
  }

  handleLine(parsedLine) {
    if (!parsedLine) return;

    const { type, content } = parsedLine;

    if (type === 'header-property') {
      const { properties } = this.extractProperties(content);
      Object.assign(this.state.headerProperties, properties);
      return;
    }

    if (type === 'page-property') {
      const { properties } = this.extractProperties(content);
      Object.assign(this.state.pageProperties, properties);
      return;
    }

    if (type === 'block') {
      this.handleBlock(parsedLine);
    } else if (type === 'property') {
      this.addPropertyToCurrentBlock(content);
    } else if (type === 'content') {
      this.appendContentToCurrentBlock(content);
    }
  }

  parse(input) {
    const lines = input.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      try {
        const parsedLine = this.parseLine(line);
        this.handleLine(parsedLine);
      } catch (error) {
        console.error(`Error parsing line: ${line.trim()}`, error);
        process.exitCode = 1;
      }
    }

    // Finalize header if we never encountered a non-property line
    if (this.state.headerContent !== null || this.state.collectingProperties) {
      const headerBlock = this.finalizeHeader();
      if (headerBlock) {
        this.state.rootBlocks.push(headerBlock);
      }
    }

    // If we have page properties, add them as an empty block with just properties
    if (Object.keys(this.state.pageProperties).length > 0) {
      const pagePropertyBlock = {
        content: "",
        properties: this.formatProperties(this.state.pageProperties)
      };
      this.state.rootBlocks.unshift(pagePropertyBlock);
    }

    return this.state.rootBlocks;
  }
}

async function wipe(options, pageName){
  try {
    const result = await wipeCommand(pageName, options);

    if (result.alreadyEmpty) {
      if (result.propertiesCount > 0) {
        console.log(`✅ Page '${pageName}' already only contains properties`);
      } else {
        console.log(`✅ Page '${pageName}' is already empty`);
      }
      return;
    }

    if (result.deletedCount === result.totalCount) {
      console.log(`✅ Wiped ${result.deletedCount} content blocks from page '${pageName}' (preserved ${result.propertiesCount} property blocks)`);
    } else {
      throw new Error(`Only deleted ${result.deletedCount} out of ${result.totalCount} blocks`);
    }

  } catch (error) {
    abort(error);
  }
}

async function update(options, name){
  const prependMode = options.prepend || false;
  const overwriteMode = options.overwrite || false;
  const logger = getLogger(options.debug || false);
  const pageName = await promise(tskNamed(name || datestamp()));

  logger.log(`Page: ${pageName}, Prepend: ${prependMode}, Overwrite: ${overwriteMode}`);

  // Read JSON payload from stdin
  const payload = await readStdin();

  if (!payload) {
    abort("Error: No payload received from stdin");
  }

  logger.log(`Payload: ${payload}`);

  // Parse JSON payload
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    abort(`Error parsing JSON payload: ${error.message}`);
  }

  // Call purge if overwrite mode is enabled
  if (overwriteMode) {
    logger.log("Overwrite mode enabled, purging page first...");

    try {
      // Use integrated wipe command
      await wipeCommand(pageName, options);
    } catch (error) {
      logger.log(`Warning: Purge had issues, continuing with overwrite... ${error.message}`);
      // Continue with overwrite even if purge had issues
    }
  }

  // Check if page exists and get page info
  let pageCheck;
  try {
    pageCheck = await callLogseq('logseq.Editor.getPage', [pageName]);
  } catch (error) {
    abort(`Error checking page existence: ${error.message}`);
  }

  logger.log(`Page check result: ${JSON.stringify(pageCheck)}`);

  let insertResponse;

  if (pageCheck && pageCheck.uuid) {
    // Page exists
    const pageUuid = pageCheck.uuid;
    logger.log(`Page exists with UUID: ${pageUuid}`);

    if (prependMode) {
      logger.log("Prepending content...");

      // Get all page blocks to check for properties
      const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      // Find the last block with properties
      let lastPropertiesBlock = null;
      if (pageBlocks && Array.isArray(pageBlocks)) {
        for (const block of pageBlocks) {
          if (block.properties && Object.keys(block.properties).length > 0) {
            lastPropertiesBlock = block;
          }
        }
      }

      if (lastPropertiesBlock) {
        logger.log(`Found properties, inserting after them...`);
        logger.log(`Properties content: ${lastPropertiesBlock.content}`);

        // Insert after the properties block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastPropertiesBlock.uuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        logger.log("No properties found, prepending to top...");

        // Prepend using page UUID with {sibling: false, before: true}
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false, before: true }
        ]);
      }
    } else {
      logger.log("Appending content...");

      const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      if (pageBlocks && Array.isArray(pageBlocks) && pageBlocks.length > 0) {
        const lastBlockUuid = pageBlocks[pageBlocks.length - 1].uuid;
        logger.log(`Appending after block: ${lastBlockUuid}`);

        // Append after last block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastBlockUuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        logger.log("Page is empty, inserting at top...");

        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false }
        ]);
      }
    }
  } else {
    // Page doesn't exist, create it
    logger.log("Page doesn't exist, creating new page...");

    const createResponse = await callLogseq('logseq.Editor.createPage', [pageName, {}]);

    if (createResponse && createResponse.uuid) {
      const pageUuid = createResponse.uuid;
      logger.log(`Created page with UUID: ${pageUuid}`);

      // Insert into new page using page UUID
      insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
        pageUuid,
        parsedPayload,
        { sibling: false }
      ]);
    } else {
      abort("Error creating page");
    }
  }

  // Check if insertion was successful
  if (insertResponse === null) {
    const blockCount = Array.isArray(parsedPayload) ? parsedPayload.length : 1;
    const action = prependMode ? "Prepended" : "Appended";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else if (Array.isArray(insertResponse)) {
    const blockCount = insertResponse.length;
    const action = prependMode ? "Prepended" : "Added";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else {
    abort("Error creating page");
  }
}

async function serial(){
  const input = await new Response(Deno.stdin.readable).text();

  if (!input.trim()) {
    console.error("Error: No input provided via stdin");
    Deno.exit(1);
  }

  const parser = new SerialParser();
  const result = parser.parse(input);
  console.log(JSON.stringify(result, null, 2));
}

function pages(options){
  return constantly(tskGetAllPages(options));
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
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('--limit <type:string>', 'Limit to N entries (none = no limit) (default: "none")', Infinity)
  .example("List regular pages", "nt pages")
  .example("List regular and journal pages", "nt pages -t all")
  .example("List regular pages as json", "nt pages --json")
  .action(pipeable(pages));

program
  .command('page')
  .alias('p')
  .description("Get page")
  .arguments(demand("name|datestamp"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('--heading <level:number>', 'Heading level (0-5, where 0=no heading)', {default: 1})
  .option('--vacant', 'Include vacant entries')
  .option('-a, --append <content:string>', 'Append content to page')
  .option('-l, --less <patterns:string>', 'Less content matching regex patterns', { collect: true })
  .option('-o, --only <patterns:string>', 'Only content matching regex patterns', { collect: true })
  .option('--agent', 'Hide content not intended for agents (see agentignore)')
  .option('--human', 'Show content intended only for humans (see agentignore)')
  .example("List wikilinks on a page", "nt page Mission | nt wikilinks")
  .example("Show content for wikilinked pages", "nt page Mission | nt wikilinks | nt page")
  .example("Show content for select pages", `nt list Atomic "Clojure Way" | nt page`)
  .example("Show content minus bare and md links", `nt page "Start With Why" --nest --less '^https?://[^)]+$' --less '^\[.*\]\(https?://[^)]+\)$'`)
  .example("Show only bare and md links", `nt page "Start With Why" --nest --only '^https?://[^)]+$' --only '^\[.*\]\(https?://[^)]+\)$'`)
  .example("Show content minus tasks", `nt page Atomic --less '^(TODO|DOING|DONE|WAITING|NOW|LATER)'`)
  .example("Show only tasks", `nt page Atomic --only '^(TODO|DOING|DONE|WAITING|NOW|LATER)'`)
  .example("Show content minus tasks and links using shorthand", `nt page Atomic --less tasks --less links`)
  .example("Show only tasks and links content using shorthand", `nt page Atomic --only tasks --only links`)
  .example("Show agent-facing content per agentignore for tasks and links", `nt page Atomic --agent`)
  .example("Show human-facing content per agentignore for tasks and links", `nt page Atomic --human`)
  .example(`Find mention of "components" on a page`, `nt page Atomic | grep -C 3 components`)
  .example(`Show journal page for select date, no heading`, `nt p --heading=0 2025-12-03`)
  .action(pipeable(page));

program
  .command('post')
  .description("Append stdin content to named page, if omitted to today's journal entry")
  .arguments("[name]")
  .option('--prepend', 'Prepend content instead')
  .option('--overwrite', 'Purges any existing page content (not properties)')
  .option('--debug', 'Enable debug output')
  .example("Append content to current journal page", `echo "- Walked for 1h" | nt post`)
  .example("Append block to target page", `echo "- Egg sandwich" | nt post Diet`)
  .example("Replace target page", `echo "- Milk\\n- Bread\\n- Eggs" | nt post Groceries --overwrite`)
  .example("Prepend block to target page", `echo "- Mom" | nt post Calls --prepend`)
  .example(`Copy a page`, `nt p --heading=0 "Recipe Template" | nt post Lasagna`);

program
  .command('update')
  .hidden()
  .description('Append stdin structured content to page')
  .arguments("[name]")
  .option('--prepend', 'Prepend content instead of appending')
  .option('--debug', 'Enable debug output')
  .option('--overwrite', 'Purge any existing page content (not properties)')
  .action(update);

program
  .command('wipe')
  .description('Wipe content, but not properties, from a page')
  .arguments(demand("name"))
  .option('--debug', 'Enable debug output')
  .action(wipe);

program
  .command('tags')
  .alias('t')
  .description('List pages with given tags (default: ALL tags)')
  .arguments(demand("tags..."))
  .option('--all', 'Require ALL tags to be present (default)')
  .option('--any', 'Require ANY tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .example("List names of pages tagged Writing", "nt tags Writing")
  .example("Show content of pages tagged Writing", "nt tags Writing | nt page")
  .example("List pages tagged Writing and Editing", "nt tags Writing Editing")
  .example("List pages tagged Writing or Editing", "nt tags Writing Editing --any")
  .example("List pages tagged Writing and Editing, explicit", "nt tags Writing Editing --all")
  .example("Normalize a tag then find pages tagged with it", "nt name writing | nt tags")
  .example("Normalize tags then find pages tagged with either", "nt l writing editing | nt n | nt tags")
  .action(pipeable(tags));

program
  .command('has')
  .alias('h')
  .description('List pages having a given prop with value(s)')
  .arguments(demand("prop", "vals..."))
  .option('--all', 'Require ALL tags to be present (default)')
  .option('--any', 'Require ANY tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(has));

program
  .command('prereq')
  .description('Recursively list page prerequisites')
  .arguments(demand("name"))
  .action(pipeable(constantly(tskPrerequisites)))
  .example("List properties for all prerequisites for a topic", `nt prereq Coding | xargs -I {} nt props {} --vacant`);

program
  .command('path')
  .description('The path to the page file')
  .arguments(demand("name"))
  .example("Display the file system path to the page", `nt path "Article Ideas"`)
  .example(`Open Moussaka page for editing in VS Code`, `nt path Moussaka | xargs code`)
  .example("Undoing recent changes, human or agent, to select page", "nt path Moussaka | xargs git restore")
  .action(pipeable(path));

program
  .command('props')
  .description('Get page properties')
  .arguments(demand("name", "property"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', {default: 'md'})
  .option('--desc', "With description")
  .option('--json', 'Output JSON format')
  .option('--heading <level:number>', 'Heading level (0-5, where 0=no heading)', {default: 1})
  .option('--vacant', 'Include vacant entries')
  .action(pipeable(props));

program
  .command('prop')
  .description('Add properties to page')
  .arguments(demand("name"))
  .option('--add <property:string>', 'Add property in format "key=value"', { collect: true })
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('--heading <level:number>', 'Heading level (0-5, where 0=no heading)', {default: 1})
  .option('--vacant', 'Include vacant entries')
  .action(pipeable(prop));

program
  .command('search')
  .alias('s')
  .description('Search pages')
  .arguments(demand("term"))
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(constantly(search)));

program
  .command('name')
  .alias('n')
  .description('Get page name as cased from page ID or case-insensitive name.')
  .arguments(demand("id|name"))
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .example("Normalize to the actual casing of the page name via stdin", `echo "writing voice" | nt n`)
  .example("Normalize to the actual casing of the page name", `nt n "writing voice"`)
  .action(pipeable(constantly(tskNamed)));

program
  .command('ident')
  .hidden()
  .description('Get page identity details')
  .arguments(demand("id|name"))
  .action(pipeable(ident));

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
  .option('--limit <type:string>', 'Limit to N entries (omit for no limit)', {default: Infinity})
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(backlinks));

program
  .command('query')
  .alias('q')
  .description('Run Datalog query')
  .arguments(demand("query"))
  .option('--limit <type:string>', 'Limit to N entries (omit for no limit)', {default: Infinity})
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(query));

// External command stubs for help visibility
program
  .command('list')
  .alias('l')
  .arguments("[item...]")
  .description('List items');

program
  .command('day')
  .alias('d')
  .arguments("[offset...]")
  .description('List one or more days')
  .example(`Show today's journal page`, `nt day | nt page`)
  .example(`Show yesterday's journal page`, `nt day -1 | nt page`)
  .example(`Show tomorrows's journal page`, `nt day 1 | nt page`)
  .example(`Show yesterday's, today's, and tomorrow's journal page`, `nt day -1 0 1 | nt page`)
  .example(`Review 90 days of journal entries in zsh`, `nt day $(seq 0 -90) | nt page`)
  .example(`Review 90 days of journal entries in pwsh`, `nt day (0..-90) | nt page`)

program
  .command('skills')
  .description('List skills and their descriptions');

program
  .command('about')
  .alias('a')
  .arguments(demand("name..."))
  .description('Retrieves information about a topic including prequisites');

program
  .command('serial')
  .description('Append stdin content to page')
  .arguments(PIPED)
  .action(serial);

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
  .description('Extracts links from content')
  .arguments(PIPED)
  .example("List links on a page", `nt page GenAI | nt links`);

program
  .command('wikilinks')
  .description('Extracts wikilinks from content')
  .arguments(PIPED)
  .example("List wikilinks on a page", `nt page Boardgames | nt wikilinks`);

program
  .command('wikify')
  .description('Convert markdown headers to wiki format')
  .arguments(PIPED);

program
  .command(
    "config",
    new Command()
      .description("Show configuration")
      .action(function(){
        this.showHelp();
      })
      .command("file", new Command()
        .description("Show the path to the config file")
        .action(function(){
          console.log(NOTE_CONFIG);
        }))
      .command("repo", new Command()
        .description("Show the path to the Logseq repo")
        .action(function(){
          console.log(config.logseq.repo);
        }))
      .command("shorthand", new Command()
        .description("Lists defined shorthand for use over tedious regexes in some commands")
        .action(function(){
          Object.entries(config.shorthand).forEach(([key, value]) => console.log(key, " => ", value));
        }))
      .command("agentignore", new Command()
        .description("Lists defined regexes (or shorthand) specifying what blocks agents ignore")
        .action(function(){
          config.agentignore.forEach(ignored => console.log(ignored));
        })));

if (import.meta.main) {
  if (Deno.args.length === 0) {
    program.showHelp();
    abort();
  } else {
    const args = Deno.args.flatMap(function(arg){
      if (arg === '--json') return ['--format=json']
      if (arg === '--md') return ['--format=md']
      return [arg]
    })
    await program.parse(args);
  }
}
