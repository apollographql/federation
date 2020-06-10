#[derive(Hash, Copy, Clone, PartialEq, Eq, Debug)]
pub struct Node {
  zone: u64,
  seq: u64,
}

use std::fmt;
impl fmt::Display for Node {
  fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
    write!(f, "{}.{}", self.zone, self.seq)
  }
}

use std::cell::Cell;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ZONE: AtomicU64 = AtomicU64::new(1);

fn next_zone() -> u64 {
  NEXT_ZONE.fetch_add(1, Ordering::Relaxed)
}

thread_local! {
  static ZONE: u64 = next_zone();
  static NEXT_SEQ: Cell<u64> = Cell::new(0);
}

impl Node {
  pub fn new() -> Node {
    ZONE.with(|zone| {
      NEXT_SEQ.with(|cell| {
        let seq = cell.get();
        cell.set(seq + 1);
        Node { zone: *zone, seq }
      })
    })
  }
}

#[test]
fn node_are_sequenced() {
  let a = Node::new();
  let b = Node::new();
  let c = Node::new();
  assert_eq!(b.seq, a.seq + 1);
  assert_eq!(c.seq, b.seq + 1);
}

#[test]
fn node_per_zone_seqs_start_at_zero() {
  std::thread::spawn(|| {
    let a = Node::new();
    let b = Node::new();
    let c = Node::new();
    assert_eq!(a.seq, 0);
    assert_eq!(b.seq, 1);
    assert_eq!(c.seq, 2);
  });
}

#[test]
fn each_thread_has_its_own_zone() {
  let t1 = std::thread::spawn(|| {
    let a = Node::new();
    let b = Node::new();
    let c = Node::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    a.zone
  });
  
  let t2 = std::thread::spawn(|| {
    let a = Node::new();
    let b = Node::new();
    let c = Node::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    a.zone
  });

  assert_ne!(t1.join().unwrap(), t2.join().unwrap());
}

#[test]
fn nodes_from_the_same_thread_are_in_the_same_zone() {
  std::thread::spawn(|| {
    let a = Node::new();
    let b = Node::new();
    let c = Node::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    assert_eq!(a.seq, 0);
    assert_eq!(b.seq, 1);
    assert_eq!(c.seq, 2);
  });
}

#[test]
fn nodes_are_unique_across_threads() {
  fn create_a_bunch_of_nodes() -> Vec<Node> {
    let mut nodes = vec![];
    for i in 0..100 {
      let n = Node::new();
      assert_eq!(n.seq, i);
      nodes.push(n);
    }
    nodes
  }

  let mut threads = vec![];
  for _ in 0..100 {
    threads.push(std::thread::spawn(create_a_bunch_of_nodes));
  }

  let mut seen = std::collections::HashMap::new();
  for t in threads {
    let nodes = t.join().unwrap();
    for n in nodes {
      assert!(!seen.contains_key(&n));
      seen.insert(n, true);
    }
  }
  assert_eq!(seen.len(), 100 * 100);
}
