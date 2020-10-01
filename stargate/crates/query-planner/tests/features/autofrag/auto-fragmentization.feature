Feature: Auto fragmentization in Query Planning
  Scenario: Using interfaces
    Given query
    """
    {
      field {
        a { b { f1 f2 f4 } }
        b { f1 f2 f4 }
        iface {
            ...on IFaceImpl1 { x }
            ...on IFaceImpl2 { x }
        }
      }
    }
    """
    When using autofragmentization
    Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "users",
        "variableUsages": [],
        "operation": "{field{...__QueryPlanFragment_2__}}fragment __QueryPlanFragment_0__ on B{f1 f2 f4}fragment __QueryPlanFragment_1__ on IFace{__typename ...on IFaceImpl1{x}...on IFaceImpl2{x}}fragment __QueryPlanFragment_2__ on SomeField{a{b{...__QueryPlanFragment_0__}}b{...__QueryPlanFragment_0__}iface{...__QueryPlanFragment_1__}}"
      }
    }
    """

  Scenario: Identical selection sets in different types
    Given query
    """
    {
      sender {
       name
       address
       location
      }
      receiver {
       name
       address
       location
      }
    }
    """
    When using autofragmentization
    Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "users",
        "variableUsages": [],
        "operation": "{sender{...__QueryPlanFragment_0__}receiver{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_0__ on SendingUser{name address location}fragment __QueryPlanFragment_1__ on ReceivingUser{name address location}"
      }
    }
    """
