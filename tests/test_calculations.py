import pytest

from app.calculations import add, subtract, multiply, divide, BankAccount, InsufficientFunds



# Function level testing

@pytest.mark.parametrize("num1, num2, expected", [
    (3, 2, 5),
    (7, 1, 8),
    (12, 4, 16)
])
def test_add(num1, num2, expected):
    print("testing add function")
    assert add(num1, num2) == expected

def test_subtract():
    assert subtract(9, 4) == 5

def test_multiply():
    assert multiply(4, 5) == 20

def test_divide():
    assert divide(20, 5) == 4



# Class level testing

# Calling a fixture function and passing it as an argument to a function, the fixture function runs before that function
@pytest.fixture
def zero_bank_account():
    print("creating empty bank account")
    return BankAccount()

@pytest.fixture
def bank_account():
    return BankAccount(40)
    
def test_bank_set_initial_amount(bank_account):
    # bank_account = BankAccount(50)
    assert bank_account.balance == 40

def test_bank_default_amount(zero_bank_account):
    print("testing bank account")
    # bank_account = BankAccount()
    assert zero_bank_account.balance == 0

def test_withdraw(bank_account):
    # bank_account = BankAccount(50)
    bank_account.withdraw(20)
    assert bank_account.balance == 20

def test_deposit(bank_account):
    # bank_account = BankAccount(50)
    bank_account.deposit(10)
    assert bank_account.balance == 50

def test_collect_interest(bank_account):
    # bank_account = BankAccount(40)
    bank_account.collect_interest()
    # assert bank_account.balance == 44
    assert round(bank_account.balance, 5) == 44

@pytest.mark.parametrize("deposited, withdraw, expected", [
    (200, 100, 100),
    (50, 10, 40),
    (1400, 400, 1000)
])
def test_bank_transaction(zero_bank_account, deposited, withdraw, expected):
    zero_bank_account.deposit(deposited)
    zero_bank_account.withdraw(withdraw)
    assert zero_bank_account.balance == expected

def test_insufficient_funds(bank_account):
    # To deal with required exception
    # with pytest.raises(Exception):
    with pytest.raises(InsufficientFunds):
        bank_account.withdraw(200)