<div id="fullcenter">

<?
echo $form->create('Miner', array('url' => '/admins/shills'));
echo $form->input('nameA');
echo $form->input('nameB');
echo $form->end('Go');
?>

<table>
<?
foreach($miners as $m)
	echo $html->tableCells(array(array($m['id'], $html->link($m['name'], '/miners/profile/'.$m['name']), $m['password'])));
?>
</table>

<?
if ($collide)
	echo "<b>Collided!</b>";
else
	echo "<b>no collisions</b>";
?>

<H3>Gold Transfers</H3>
<span style="font-size:12px"><table>
<?
echo $html->tableHeaders(array('From', 'To', 'Gold', 'Approved'));
foreach($transfers as $t)
	echo $html->tableCells(array($t['from'], $t['to'], $t['gold'], $t['approved']));
?>
</table></span>

<?function Accounts($accounts, $html)
{
	echo '<table>'; 
	foreach($accounts as $account)
	{		
		echo $html->tableCells(array(array(
			$account['BankingAccount']['is_deposit'] ? 'Deposit' : 'Loan',
			$account['BankingAccount']['principle'],
			$account['BankingAccount']['interest'].'%',
			$account['BankingAccount']['duration'].'d',
			date('y-m-d', $account['BankingAccount']['created_time']),
			)));
		foreach($account['BankingPayment'] as $p)
			echo $html->tableCells(array(array(
				'Payment',
				$p['gold'],
				'',
				'',
				date('y-m-d', $p['created_time']))));
	}
	echo '</table>';

}?>

<H3>Banking</H3>
<? if (isset($accountsAB)): ?>
	<h4><? echo $miners[0]['name']; ?> as customer of <? echo $html->link($miners[1]['name'], '/banks/view/'.$miners[1]['name']); ?></h4>
	<? accounts($accountsAB, $html); ?>
<? endif; ?>

<? if (isset($accountsBA)): ?>
	<h4><? echo $miners[1]['name']; ?> as customer of <? echo $html->link($miners[0]['name'], '/banks/view/'.$miners[0]['name']); ?></h4>
	<? accounts($accountsBA, $html); ?>
<? endif; ?>

<H3>Thing Sales</H3>
<span style="font-size:12px"><table>
<?
echo $html->tableHeaders(array('Buyer', 'Seller', 'Item', 'City', 'Price', 'Quantity', 'Bid', 'Created'));
foreach($thingSales as $s)
	echo $html->tableCells(array($s['buyer'], $s['seller'], $s['item'], $s['city'], $s['price'], $s['quantity'], $s['bid'], $s['created']));
?></table></span>



<H3>Messages<H3>
<span style="font-size:12px">
<?
foreach($messages as $m)
{
	echo '<span style="color:blue">From '.$m['from'].' sent '.$m['sent'].':</span><BR>';
	echo $m['body'].'<BR><BR>';
}
?>
</span>
</div>