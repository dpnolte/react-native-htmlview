import React from "react";
import { Text, View } from "react-native";
import htmlparser from "htmlparser2-without-node-native";
import entities from "entities";

import AutoSizedImage from "./AutoSizedImage";

const defaultOpts = {
  lineBreak: "\n",
  paragraphBreak: "\n\n",
  bullet: "\u2022 ",
  TextComponent: Text,
  textComponentProps: null,
  NodeComponent: Text,
  nodeComponentProps: null
};

const Img = props => {
  const width =
    parseInt(props.attribs["width"], 10) ||
    parseInt(props.attribs["data-width"], 10) ||
    0;
  const height =
    parseInt(props.attribs["height"], 10) ||
    parseInt(props.attribs["data-height"], 10) ||
    0;

  const imgStyle = {
    width,
    height
  };

  const source = {
    uri: props.attribs.src,
    width,
    height
  };
  return <AutoSizedImage source={source} style={imgStyle} />;
};

const whiteSpaceOrNewLineRegex = /[\S|\n|\r|\t]+/;

export default function htmlToElement(rawHtml, customOpts = {}, done) {
  const opts = {
    ...defaultOpts,
    ...customOpts
  };

  const nestedStyles = {};
  const parentStyles = {};
  if (opts.styles) {
    Object.keys(opts.styles).forEach(styleName => {
      let splitName = styleName.split(">");
      if (splitName.length === 2) {
        const [parentNodeName, childNodeName] = splitName;
        nestedStyles[childNodeName] = {
          [parentNodeName]: styleName
        };
      }

      splitName = styleName.split("<");
      if (splitName.length === 2) {
        const [parentNodeName, childNodeName] = splitName;
        parentStyles[parentNodeName] = {
          [childNodeName]: styleName
        };
      }
    });
  }
  function domToElement(dom, parent, parentInheritedStyle = []) {
    if (!dom) return null;

    const renderNode = opts.customRenderer;
    let orderedListCounter = 1;

    return dom.map((node, index, list) => {
      try {
        const parentAndNestedStyles = getParentAndNestedStyles(
          node,
          parentStyles,
          nestedStyles,
          opts
        );
        const inheritedStyle = getInheritedStyle(
          node,
          parentAndNestedStyles.length > 0
            ? parentInheritedStyle.concat(parentAndNestedStyles)
            : parentInheritedStyle,
          opts
        );
        if (renderNode) {
          const rendered = renderNode(
            node,
            index,
            list,
            parent,
            (nextNode, nextParent) =>
              domToElement(nextNode, nextParent, inheritedStyle), // defaultRenderer,
            inheritedStyle
          );
          if (rendered || rendered === null) {
            return rendered;
          }
        }

        const { TextComponent } = opts;

        if (node.type === "text") {
          const style =
            opts.textComponentProps && opts.textComponentProps.style
              ? [opts.textComponentProps.style, ...inheritedStyle]
              : inheritedStyle;

          // don't convert empty texts
          if (style.length === 0 && whiteSpaceOrNewLineRegex.test(node.data)) {
            return null;
          }

          return (
            <TextComponent
              {...opts.textComponentProps}
              key={index}
              style={style.length ? style : undefined}
            >
              {entities.decodeHTML(node.data)}
            </TextComponent>
          );
        }

        if (node.type === "tag") {
          if (node.name === "img") {
            return <Img key={index} attribs={node.attribs} />;
          }

          let linkPressHandler = undefined;
          let linkLongPressHandler = undefined;
          if (node.name === "a" && node.attribs && node.attribs.href) {
            linkPressHandler = () =>
              opts.linkHandler(entities.decodeHTML(node.attribs.href));
            if (opts.linkLongPressHandler) {
              linkLongPressHandler = () =>
                opts.linkLongPressHandler(
                  entities.decodeHTML(node.attribs.href)
                );
            }
          }

          let linebreakBefore = null;
          let linebreakAfter = null;
          if (opts.addLineBreaks) {
            switch (node.name) {
              case "pre":
                linebreakBefore = opts.lineBreak;
                break;
              case "p":
                if (index < list.length - 1) {
                  linebreakAfter = opts.paragraphBreak;
                }
                break;
              case "br":
              case "h1":
              case "h2":
              case "h3":
              case "h4":
              case "h5":
                linebreakAfter = opts.lineBreak;
                break;
            }
          }

          let listItemPrefix = null;
          if (node.name === "li") {
            const style =
              opts.textComponentProps && opts.textComponentProps.style
                ? [opts.textComponentProps.style, ...inheritedStyle]
                : inheritedStyle;

            if (parent.name === "ol") {
              listItemPrefix = (
                <TextComponent style={style.length ? style : undefined}>
                  {`${orderedListCounter++}. `}
                </TextComponent>
              );
            } else if (parent.name === "ul") {
              listItemPrefix = (
                <TextComponent style={style.length ? style : undefined}>
                  {opts.bullet}
                </TextComponent>
              );
            }
            if (opts.addLineBreaks && index < list.length - 1) {
              linebreakAfter = opts.lineBreak;
            }
          }

          const { NodeComponent, styles } = opts;

          const nodeStyle = node.parent ? [styles[node.name]] : [];
          if (parentAndNestedStyles.length > 0) {
            nodeStyle.push(...parentAndNestedStyles);
          }

          if (nodeStyle.length === 0 && node.children.length === 0) {
            return null;
          }

          return (
            <NodeComponent
              {...opts.nodeComponentProps}
              key={index}
              onPress={linkPressHandler}
              style={nodeStyle.length > 0 ? nodeStyle : undefined}
              onLongPress={linkLongPressHandler}
            >
              {linebreakBefore}
              {listItemPrefix}
              {domToElement(node.children, node, inheritedStyle)}
              {linebreakAfter}
            </NodeComponent>
          );
        }
      } catch (err) {
        throw err;
      }
    });
  }

  const handler = new htmlparser.DomHandler(function(err, dom) {
    if (err) done(err);
    done(null, domToElement(dom));
  });
  const parser = new htmlparser.Parser(handler);
  parser.write(rawHtml);
  parser.done();
}

function getInheritedStyle(node, parentInheritedStyle, opts) {
  if (!node || !node.name) {
    return [];
  }

  const inheritedStyle = [...parentInheritedStyle];
  if (opts.styles[node.name]) {
    inheritedStyle.push(opts.styles[node.name]);
  }

  return inheritedStyle;
}

function getParentAndNestedStyles(node, parentStyles, nestedStyles, opts) {
  if (!node || !node.name) {
    return [];
  }

  const styles = [];
  if (parentStyles[node.name]) {
    // check if it has children of nested style
    node.children.forEach(child => {
      if (node.type === "tag") {
        const styleForParentName = parentStyles[node.name][child.name];
        if (styleForParentName) {
          styles.push(opts.styles[styleForParentName]);
        }
      }
    });
  }
  if (nestedStyles[node.name] && nestedStyles[node.name][node.parent.name]) {
    const styleForChildName = nestedStyles[node.name][node.parent.name];
    styles.push(opts.styles[styleForChildName]);
  }

  return styles;
}
