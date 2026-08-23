<h1> Your Items <h1>

<? //print_r( $miners ); 
$itemCount = count($miners['Item']);
$rows = 15;
$cols = 5;
?>

<table>
<?
	$rows = 15;
	for ($r = 0; $r < $rows; $r++)
	{
		print "<tr>";
		for ($c = 0; $c < $cols && $r*$rows + $c < $itemCount; $c++)
		{
			$item = $miners['Item'][$r*$cols + $c];
			print "<td>";
			print $item['name'];
			print "(";
			for ($a = 0; $a < $item['rarity']; $a++)
				print "*";
			print ")";

			print "</td>";
		}
		print "</tr>";
	}
?>
<table>

<? echo ($itemCount - $rows*$cols)." more items."; ?>
<br>
<? echo $itemCount." total items."; ?>