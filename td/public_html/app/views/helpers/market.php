<?

class MarketHelper extends AppHelper
{
	var $helpers = array('Html');

	function commatize($number)
	{
		if ($number >= 10)
			$decimals = 0;
		else
			$decimals = 2;
	
		$number = (string)number_format($number, $decimals); 	
		return $number;
	}
	
	function commatizeGoldTags($text)
	{
		// translate [gold] tags into commatized gold
		$regEx = '/\[gold\]([^\[]*)\[\/gold\]/';
		while (preg_match($regEx, $text, $matches))
		{
			$gold = $this->commatize($matches[1]).'g';
			$limit = 1;
			$text = preg_replace($regEx, $gold, $text, $limit);
		}
		return $text;
	}
	
	function spread($spread)
	{		
		foreach($spread as &$s)
			if ($s != NULL)
				$s = $this->commatize($s);
				
		if ($spread[0] != NULL and $spread[1] != NULL)
			return $spread[0]."g - ".$spread[1]."g";
		else if ($spread[0] == NULL and $spread[1] == NULL)
			return NULL;
		else if ($spread[0] == NULL)
			return $spread[1].'g listing';
		else
			return $spread[0].'g bid';
	}

	function priceQuantity($price, $quantity)
	{
		$string = $this->commatize($price).'g';
		if ($quantity > 1)
			$string = $quantity.'&nbsp;x&nbsp;'.$string;
		return $string;
	}

/*
	function bidTable($bids, $bestBid)
	{
		$table = '<table class="itemview-table">';
		//$table.= $this->Html->tableHeaders( array ('Amount', 'Bidder') );
		if ($bestBid)
			$title = $this->Element('buy_button', array('name' => 
		$table.= '<tr class="large"><td colspan=3>'.$title.'</td></tr>';
		$cells = array();
		foreach ($bids as $b) {
			$price = $this->priceQuantity($b['price'], $b['quantity']);
			if (!$b['hasGold'])
				$price = '<span style="color:red">'.$price.'</span>';

			if ($b['belongsToMiner'])
				$action = $this->Html->link( 'cancel', '/marketables/cancel/'.$b['id'] );
			else
				$action = '';

			$bidder = $this->Html->link($b['traderName'], $b['traderHref']);

			
			$cells[] = array(
				$bidder, 
				array($price, array('style' => 'text-align:right') ),
				$action );
		}
		$table.= $this->Html->tableCells($cells, array('class' => 'odd'), null, false, false);
		$table.= "</table>";

		return $table;

	}

	function listingTable($listings, $title='Listings')
	{
		$table = '<table class="itemview-table">';
		//$table.= $this->Html->tableHeaders( array ('Amount', 'Seller') );
		$table.= '<tr class="large"><td colspan=3>'.$title.'</td></tr>';
		$cells = array();
		foreach ($listings as $l){
			if ($l['belongsToMiner'])
				$action = $this->Html->link( 'cancel', '/marketables/cancel/'.$l['id'] );
			else
				$action = '';

			$cells[] = array (
				$this->Html->link($l['traderName'], $l['traderHref']), 
				array($this->priceQuantity($l['price'], $l['quantity']), array('style' => 'text-align:right')),
				$action );
		}
		$table.= $this->Html->tableCells($cells, array('class' => 'odd'), null, false, false);
		$table.= "</table>";
		return $table;
	}

	function salesTable($sales)
	{
		$table = '<table class="itemview-table">';
		$table.= '<tr class="large"><td colspan=2>Sales</td></tr>';
		$cells = array();
		foreach ($sales as $sale) {
			$time = date('y/m/d', strtotime($sale['created']));
			$cells[] = array(
				$time,
				$this->priceQuantity($sale['price'], $sale['quantity']));
		}
		$table.= $this->Html->tableCells($cells, array('class' => 'odd'), null, false, false);
		$table.= "</table>";
		return $table;
	}

	function foreignSpreadTable($foreignLimitOrders)
	{
		$table = '<table class="itemview-table">';
		$table.= '<tr class="large"><td colspan=2>Foreign&nbsp;Spread</td></tr>';
		$cells = array();
		foreach($foreignLimitOrders as $p)
			if (isset($p['bestListing']) or isset($p['bestBid']))
			{
				$bid = isset($p['bestBid']) ? $this->priceQuantity($p['bestBid'], 1) : '[NA]';
				$listing = isset($p['bestListing']) ? $this->priceQuantity($p['bestListing'], 1) : '[NA]';
				
				$cells[] = array(
					$p['cityName'], 
					"$bid&nbsp;-&nbsp;$listing",					
					);
			}
				
		$table.= $this->Html->tableCells(
			$cells, 
			array('class' => 'odd'), 
			null, false, false);
		$table.= "</table>";
		return $table;	

	}

	function marketTable($listings, $bids, $sales, $foreignLimitOrders)
	{

		echo "<table cellspacing=0 cellpadding=0>";
		echo "<tr >";

		echo "<td valign='top'>";
		echo $this->listingTable($listings);
		echo "</td>";

		echo "<td valign='top'>";
		echo $this->bidTable($bids);
		echo "</td>";

		echo "<td valign=top>";
		echo $this->salesTable($sales);
		echo "</td>";

		if (count($foreignLimitOrders))
		{
			echo "<td valign=top>";
			echo $this->foreignSpreadTable($foreignLimitOrders);
			echo "</td>";
		}
			

		echo "</tr>";
		echo "</table>";
	}*/
}

?>
