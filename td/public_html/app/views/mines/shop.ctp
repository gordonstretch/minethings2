<?
echo "<h3>Mine Shop</h3>"
?><table><?
echo $html->tableHeaders(array("Mine", "Cost", "purchase") );
foreach ($mineTypes as $m)
{
	$formText = $form->create(0, array('action' => 'buy_mine'));
	$formText.= $form->input('id', array('type' => 'hidden', 'value' => $m['id']));
	$formText.= $form->end('Buy');

	$elements = array($m['name'], $m['credit_cost']." credits", $formText );
	echo $html->tableCells(array($elements));
}
?>
</table>